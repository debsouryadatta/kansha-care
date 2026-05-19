import { openai } from "@ai-sdk/openai";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import type { DbClient } from "@kansha/db";
import { schema } from "@kansha/db";
import { and, eq, gt } from "drizzle-orm";
import { Telegraf } from "telegraf";
import {
  agentSystemPrompt,
  appendAgentMessages,
  buildAgentTools,
  executePendingAgentAction,
  getOrCreateAgentConversation,
  loadAgentMessages,
  makeTextMessage,
  pendingActionsForConversation
} from "@kansha/agent";
import type { WorkerEnv } from "../env";
import { sha256 } from "./crypto";

export function createTelegramBot(db: DbClient, env: WorkerEnv) {
  const bot = new Telegraf(env.TELEGRAM_BOT_TOKEN);

  bot.start(async (ctx) => {
    const payload = ctx.payload;
    if (!payload?.startsWith("connect_")) {
      await ctx.reply(`Please sign up or log in at ${env.WEB_URL} and connect Telegram from your dashboard.`);
      return;
    }

    const rawToken = payload.replace("connect_", "");
    const [token] = await db
      .select()
      .from(schema.telegramLinkTokens)
      .where(
        and(
          eq(schema.telegramLinkTokens.tokenHash, sha256(rawToken)),
          gt(schema.telegramLinkTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (!token || token.usedAt) {
      await ctx.reply("This Telegram connection link is invalid or expired. Please create a new one from the dashboard.");
      return;
    }

    const chat = ctx.chat;
    await db
      .update(schema.telegramChats)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(schema.telegramChats.userId, token.userId));

    await db.insert(schema.telegramChats).values({
      userId: token.userId,
      chatId: String(chat.id),
      username: "username" in chat ? chat.username ?? null : null,
      firstName: "first_name" in chat ? chat.first_name ?? null : null,
      isActive: true
    });

    await db
      .update(schema.telegramLinkTokens)
      .set({ usedAt: new Date() })
      .where(eq(schema.telegramLinkTokens.id, token.id));

    await ctx.reply("Telegram connected successfully. You will now receive earthquake alerts and daily summaries.");
  });

  bot.command("disconnect", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const result = await db
      .update(schema.telegramChats)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(schema.telegramChats.chatId, chatId), eq(schema.telegramChats.isActive, true)))
      .returning();
    await ctx.reply(
      result.length
        ? "Telegram alerts are now disconnected for this account."
        : `This Telegram chat is not linked. Please connect it from ${env.WEB_URL}.`
    );
  });

  bot.command("status", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const [chat] = await db
      .select()
      .from(schema.telegramChats)
      .where(and(eq(schema.telegramChats.chatId, chatId), eq(schema.telegramChats.isActive, true)))
      .limit(1);
    if (!chat) {
      await ctx.reply(`Please sign up or log in at ${env.WEB_URL} and connect Telegram from your dashboard.`);
      return;
    }
    const [state] = await db.select().from(schema.appState).where(eq(schema.appState.id, "global")).limit(1);
    await ctx.reply(
      [
        "System status",
        `Health: ${state?.healthStatus ?? "degraded"}`,
        `Backfill: ${state?.backfillStatus ?? "pending"}`,
        `Last successful poll: ${state?.lastSuccessfulPollAt?.toISOString() ?? "never"}`,
        `Dashboard: ${env.PUBLIC_DASHBOARD_URL}`
      ].join("\n")
    );
  });

  bot.command("locations", async (ctx) => {
    const chatId = String(ctx.chat.id);
    const [chat] = await db
      .select()
      .from(schema.telegramChats)
      .where(and(eq(schema.telegramChats.chatId, chatId), eq(schema.telegramChats.isActive, true)))
      .limit(1);
    if (!chat) {
      await ctx.reply(`Please sign up or log in at ${env.WEB_URL} and connect Telegram from your dashboard.`);
      return;
    }
    const locations = await db
      .select()
      .from(schema.monitoredLocations)
      .where(eq(schema.monitoredLocations.userId, chat.userId));
    await ctx.reply(
      locations.length
        ? locations
            .map(
              (location) =>
                `${location.label}: M >= ${location.magnitudeThreshold} within ${location.radiusKm} km`
            )
            .join("\n")
        : "No monitored locations yet. Add up to 3 from your dashboard."
    );
  });

  bot.command("summary", async (ctx) => {
    await ctx.reply(`Daily summaries run at 09:00 IST. You can view the current dashboard at ${env.PUBLIC_DASHBOARD_URL}.`);
  });

  bot.action(/agent_action:(approve|deny):(.+)/, async (ctx) => {
    const action = ctx.match[1];
    const pendingActionId = ctx.match[2];
    const result = await executePendingAgentAction(db, pendingActionId, action === "approve");
    await ctx.answerCbQuery(result.ok ? "Done" : result.message);
    await ctx.reply(result.message);
  });

  bot.on("message", async (ctx) => {
    const text = "text" in ctx.message ? ctx.message.text.trim() : "";
    if (!text || text.startsWith("/")) {
      await ctx.reply(`Please connect Telegram from ${env.WEB_URL} to use Kansha alerts and the assistant.`);
      return;
    }

    const linked = await getLinkedTelegramUser(db, String(ctx.chat.id));
    if (!linked) {
      await ctx.reply(`Please sign up or log in at ${env.WEB_URL} and connect Telegram from your dashboard.`);
      return;
    }

    await handleTelegramAgentMessage(db, env, ctx, linked, text);
  });

  return bot;
}

async function getLinkedTelegramUser(db: DbClient, chatId: string) {
  const [row] = await db
    .select({
      telegramChatId: schema.telegramChats.id,
      chatId: schema.telegramChats.chatId,
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role
    })
    .from(schema.telegramChats)
    .innerJoin(schema.users, eq(schema.users.id, schema.telegramChats.userId))
    .where(and(eq(schema.telegramChats.chatId, chatId), eq(schema.telegramChats.isActive, true)))
    .limit(1);

  return row ?? null;
}

async function handleTelegramAgentMessage(
  db: DbClient,
  env: WorkerEnv,
  ctx: any,
  linked: NonNullable<Awaited<ReturnType<typeof getLinkedTelegramUser>>>,
  text: string
) {
  const conversation = await getOrCreateAgentConversation(db, {
    userId: linked.userId,
    surface: "telegram",
    telegramChatId: linked.telegramChatId
  });
  const user = {
    id: linked.userId,
    name: linked.name,
    email: linked.email,
    role: linked.role
  };
  const userMessage = makeTextMessage("user", text);
  const previous = await loadAgentMessages(db, conversation.id, 39);
  const tools = buildAgentTools({
    db,
    user,
    env: {
      geocoderUserAgent: env.GEOCODER_USER_AGENT,
      geoapifyApiKey: env.GEOAPIFY_API_KEY,
      telegramBotUsername: env.TELEGRAM_BOT_USERNAME
    },
    surface: "telegram",
    telegramChatId: linked.telegramChatId,
    conversationId: conversation.id,
    actionMode: "pending"
  });
  const messages = [...previous, userMessage].slice(-40);
  const modelMessages = await convertToModelMessages(messages, { tools });
  const result = streamText({
    model: openai("gpt-4.1"),
    system: agentSystemPrompt("telegram"),
    messages: modelMessages,
    tools,
    stopWhen: stepCountIs(5),
    providerOptions: {
      openai: {
        store: false,
        user: linked.userId
      }
    }
  });

  let finalText = "";
  let lastDraftAt = 0;
  async function publishDraft(statusText: string) {
    const now = Date.now();
    if (now - lastDraftAt < 1200) return;
    lastDraftAt = now;
    const sent = await sendTelegramDraft(env.TELEGRAM_BOT_TOKEN, linked.chatId, statusText).catch(() => false);
    if (!sent) await ctx.sendChatAction("typing").catch(() => undefined);
  }

  await publishDraft("Thinking...");
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      finalText += part.text;
      await publishDraft(finalText.slice(-900) || "Writing...");
    } else if (part.type === "tool-input-start" || part.type === "tool-call") {
      await publishDraft(`Checking ${formatToolName((part as any).toolName ?? "tool")}...`);
    } else if (part.type === "tool-result") {
      await publishDraft(`Finished ${formatToolName((part as any).toolName ?? "tool")}.`);
    } else if (part.type === "tool-error") {
      await publishDraft(`Tool failed: ${formatToolName((part as any).toolName ?? "tool")}.`);
    }
  }

  const answer = finalText.trim() || "I prepared a result, but there was no text response.";
  await sendLongTelegramReply(ctx, answer);
  await appendAgentMessages(db, conversation.id, [userMessage, makeTextMessage("assistant", answer)]);

  const pendingActions = await pendingActionsForConversation(db, conversation.id);
  for (const pending of pendingActions.slice(0, 4)) {
    await ctx.reply(`Approval needed: ${formatPendingAction(pending.toolName, pending.input)}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Approve", callback_data: `agent_action:approve:${pending.id}` },
            { text: "Deny", callback_data: `agent_action:deny:${pending.id}` }
          ]
        ]
      }
    });
  }
}

function formatPendingAction(toolName: string, input: unknown) {
  const data = input as Record<string, unknown>;
  if (toolName === "addMonitoredLocation") return `add ${data.address}`;
  if (toolName === "updateLocationRules") return `update location rules for ${data.locationId}`;
  if (toolName === "removeMonitoredLocation") return `remove location ${data.locationId}`;
  if (toolName === "disconnectTelegram") return "disconnect Telegram";
  return formatToolName(toolName);
}

function formatToolName(name: string) {
  return name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function sendLongTelegramReply(ctx: any, text: string) {
  const chunks = text.match(/[\s\S]{1,3900}/g) ?? [text];
  for (const chunk of chunks) {
    await ctx.reply(chunk, { disable_web_page_preview: true });
  }
}

export async function sendTelegramDraft(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessageDraft`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 3900)
    })
  });
  return response.ok;
}

export async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });
  if (!response.ok) {
    throw new Error(`Telegram send failed: ${response.status} ${await response.text()}`);
  }
}
