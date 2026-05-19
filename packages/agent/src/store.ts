import { and, desc, eq, isNull } from "drizzle-orm";
import type { UIMessage } from "ai";
import { schema, type DbClient } from "@kansha/db";

export type AgentSurface = "web" | "telegram";

export type AgentUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
};

export async function getOrCreateAgentConversation(
  db: DbClient,
  input: {
    userId: string;
    surface: AgentSurface;
    telegramChatId?: string | null;
  }
) {
  const conditions = [
    eq(schema.agentConversations.userId, input.userId),
    eq(schema.agentConversations.surface, input.surface),
    eq(schema.agentConversations.isActive, true)
  ];
  conditions.push(
    input.telegramChatId
      ? eq(schema.agentConversations.telegramChatId, input.telegramChatId)
      : isNull(schema.agentConversations.telegramChatId)
  );

  const [existing] = await db
    .select()
    .from(schema.agentConversations)
    .where(and(...conditions))
    .orderBy(desc(schema.agentConversations.updatedAt))
    .limit(1);

  if (existing) return existing;

  const [conversation] = await db
    .insert(schema.agentConversations)
    .values({
      userId: input.userId,
      surface: input.surface,
      telegramChatId: input.telegramChatId ?? null,
      title: input.surface === "telegram" ? "Telegram assistant" : "Dashboard assistant"
    })
    .returning();

  return conversation;
}

export async function loadAgentMessages(db: DbClient, conversationId: string, limit = 40): Promise<UIMessage[]> {
  const rows = await db
    .select()
    .from(schema.agentMessages)
    .where(eq(schema.agentMessages.conversationId, conversationId))
    .orderBy(desc(schema.agentMessages.createdAt))
    .limit(limit);

  return rows.reverse().map((row) => row.message as UIMessage);
}

export async function replaceAgentMessages(db: DbClient, conversationId: string, messages: UIMessage[]) {
  await db.delete(schema.agentMessages).where(eq(schema.agentMessages.conversationId, conversationId));
  if (messages.length) {
    await db.insert(schema.agentMessages).values(
      messages.map((message) => ({
        conversationId,
        messageId: message.id,
        role: message.role,
        message
      }))
    );
  }
  await db
    .update(schema.agentConversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.agentConversations.id, conversationId));
}

export async function appendAgentMessages(db: DbClient, conversationId: string, messages: UIMessage[]) {
  if (!messages.length) return;
  await db.insert(schema.agentMessages).values(
    messages.map((message) => ({
      conversationId,
      messageId: message.id,
      role: message.role,
      message
    }))
  );
  await db
    .update(schema.agentConversations)
    .set({ updatedAt: new Date() })
    .where(eq(schema.agentConversations.id, conversationId));
}

export function makeTextMessage(role: "user" | "assistant" | "system", text: string): UIMessage {
  return {
    id: crypto.randomUUID(),
    role,
    parts: [{ type: "text", text }]
  };
}
