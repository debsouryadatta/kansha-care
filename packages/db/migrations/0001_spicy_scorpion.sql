CREATE TYPE "public"."agent_action_status" AS ENUM('pending', 'approved', 'denied', 'expired', 'executed');--> statement-breakpoint
CREATE TYPE "public"."agent_surface" AS ENUM('web', 'telegram');--> statement-breakpoint
CREATE TABLE "agent_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"surface" "agent_surface" NOT NULL,
	"telegram_chat_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"title" varchar(180),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"message_id" varchar(160) NOT NULL,
	"role" varchar(40) NOT NULL,
	"message" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_pending_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"surface" "agent_surface" NOT NULL,
	"telegram_chat_id" uuid,
	"tool_name" varchar(120) NOT NULL,
	"tool_call_id" varchar(180),
	"input" jsonb NOT NULL,
	"status" "agent_action_status" DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversations" ADD CONSTRAINT "agent_conversations_telegram_chat_id_telegram_chats_id_fk" FOREIGN KEY ("telegram_chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_messages" ADD CONSTRAINT "agent_messages_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pending_actions" ADD CONSTRAINT "agent_pending_actions_conversation_id_agent_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."agent_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pending_actions" ADD CONSTRAINT "agent_pending_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_pending_actions" ADD CONSTRAINT "agent_pending_actions_telegram_chat_id_telegram_chats_id_fk" FOREIGN KEY ("telegram_chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_conversations_user_surface_idx" ON "agent_conversations" USING btree ("user_id","surface");--> statement-breakpoint
CREATE INDEX "agent_conversations_telegram_chat_idx" ON "agent_conversations" USING btree ("telegram_chat_id");--> statement-breakpoint
CREATE INDEX "agent_conversations_active_idx" ON "agent_conversations" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "agent_messages_conversation_idx" ON "agent_messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_messages_message_idx" ON "agent_messages" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "agent_messages_created_idx" ON "agent_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "agent_pending_actions_user_status_idx" ON "agent_pending_actions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "agent_pending_actions_conversation_idx" ON "agent_pending_actions" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "agent_pending_actions_expires_idx" ON "agent_pending_actions" USING btree ("expires_at");