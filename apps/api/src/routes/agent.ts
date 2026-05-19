import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  validateUIMessages,
  type UIMessage
} from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import {
  agentSystemPrompt,
  buildAgentTools,
  executeAgentAction,
  getOrCreateAgentConversation,
  loadAgentMessages,
  replaceAgentMessages
} from "@kansha/agent";
import { schema, type DbClient } from "@kansha/db";
import type { ApiEnv } from "../env";
import { HttpError, parseJson } from "../lib/http";
import { requireAuth } from "../middleware/auth";
import type { AppBindings, AuthUser } from "../middleware/auth";

const suggestedActions = [
  "What can you do?",
  "Summarize last 24h",
  "Check my locations",
  "Find M4+ near Delhi",
  "Explain my latest alert"
];

const chatBodySchema = z.object({
  id: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(),
  messages: z.array(z.unknown()).default([])
});

const actionBodySchema = z.object({
  toolName: z.enum(["addMonitoredLocation", "updateLocationRules", "removeMonitoredLocation", "disconnectTelegram"]),
  input: z.unknown()
});

function userFromAuth(user: AuthUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function agentEnv(env: ApiEnv) {
  return {
    geocoderUserAgent: env.GEOCODER_USER_AGENT,
    geoapifyApiKey: env.GEOAPIFY_API_KEY,
    telegramBotUsername: env.TELEGRAM_BOT_USERNAME
  };
}

async function getOwnedWebConversation(db: DbClient, userId: string, conversationId?: string) {
  if (!conversationId) return getOrCreateAgentConversation(db, { userId, surface: "web" });

  const [conversation] = await db
    .select()
    .from(schema.agentConversations)
    .where(
      and(
        eq(schema.agentConversations.id, conversationId),
        eq(schema.agentConversations.userId, userId),
        eq(schema.agentConversations.surface, "web"),
        isNull(schema.agentConversations.telegramChatId)
      )
    )
    .limit(1);

  if (!conversation) throw new HttpError(404, "Agent conversation not found");
  return conversation;
}

export function agentRoutes(db: DbClient, env: ApiEnv) {
  const app = new Hono<AppBindings>();

  app.use("*", requireAuth(env.JWT_SECRET));

  app.get("/session", async (c) => {
    const user = c.get("user");
    const conversation = await getOrCreateAgentConversation(db, { userId: user.id, surface: "web" });
    const messages = await loadAgentMessages(db, conversation.id, 40);

    return c.json({
      conversationId: conversation.id,
      messages,
      suggestedActions
    });
  });

  app.post("/chat", async (c) => {
    const user = userFromAuth(c.get("user"));
    const body = await parseJson(c, chatBodySchema);
    const conversation = await getOwnedWebConversation(db, user.id, body.conversationId ?? body.id);
    const tools = buildAgentTools({
      db,
      user,
      env: agentEnv(env),
      surface: "web",
      conversationId: conversation.id,
      actionMode: "client"
    }) as any;
    const uiMessages = await validateUIMessages({
      messages: body.messages.slice(-40),
      tools
    });
    const modelMessages = await convertToModelMessages(uiMessages, {
      tools,
      ignoreIncompleteToolCalls: false
    });

    const result = streamText({
      model: openai("gpt-4.1"),
      system: agentSystemPrompt("web"),
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(5),
      providerOptions: {
        openai: {
          store: false,
          user: user.id
        }
      }
    });

    return result.toUIMessageStreamResponse<UIMessage>({
      originalMessages: uiMessages,
      onFinish: async ({ messages }) => {
        await replaceAgentMessages(db, conversation.id, messages.slice(-40));
      }
    });
  });

  app.post("/actions", async (c) => {
    const user = userFromAuth(c.get("user"));
    const body = await parseJson(c, actionBodySchema);
    const result = await executeAgentAction(
      {
        db,
        user,
        env: agentEnv(env),
        telegramChatId: null
      },
      body.toolName,
      body.input
    );
    return c.json({ result });
  });

  return app;
}
