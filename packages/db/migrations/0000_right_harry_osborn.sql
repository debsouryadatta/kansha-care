CREATE TYPE "public"."alert_severity" AS ENUM('info', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."alert_type" AS ENUM('global_high_severity', 'local_high_severity', 'swarm', 'source_silence', 'daily_summary');--> statement-breakpoint
CREATE TYPE "public"."backfill_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."health_status" AS ENUM('healthy', 'degraded', 'down');--> statement-breakpoint
CREATE TYPE "public"."ingestion_status" AS ENUM('success', 'failure');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TABLE "alert_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alert_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"telegram_chat_id" uuid,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "alert_type" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"dedupe_key" text NOT NULL,
	"earthquake_event_id" uuid,
	"user_id" uuid,
	"location_id" uuid,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_state" (
	"id" varchar(60) PRIMARY KEY DEFAULT 'global' NOT NULL,
	"backfill_status" "backfill_status" DEFAULT 'pending' NOT NULL,
	"health_status" "health_status" DEFAULT 'degraded' NOT NULL,
	"last_successful_poll_at" timestamp with time zone,
	"last_failed_poll_at" timestamp with time zone,
	"last_backfill_at" timestamp with time zone,
	"total_inserted" integer DEFAULT 0 NOT NULL,
	"total_updated" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"summary_date" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"status" "delivery_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earthquake_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usgs_id" varchar(120) NOT NULL,
	"magnitude" double precision,
	"place" text NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"updated" timestamp with time zone,
	"longitude" double precision NOT NULL,
	"latitude" double precision NOT NULL,
	"depth_km" double precision,
	"alert" varchar(40),
	"significance" integer,
	"tsunami" boolean DEFAULT false NOT NULL,
	"felt" integer,
	"cdi" double precision,
	"mmi" double precision,
	"mag_type" varchar(40),
	"url" text,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "geocoding_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"label" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(80) NOT NULL,
	"status" "ingestion_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"inserted" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "monitored_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(160) NOT NULL,
	"address" text NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"radius_km" integer DEFAULT 500 NOT NULL,
	"magnitude_threshold" double precision DEFAULT 4 NOT NULL,
	"alerts_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"chat_id" varchar(120) NOT NULL,
	"username" varchar(160),
	"first_name" varchar(160),
	"is_active" boolean DEFAULT true NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_alert_id_alerts_id_fk" FOREIGN KEY ("alert_id") REFERENCES "public"."alerts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alert_deliveries" ADD CONSTRAINT "alert_deliveries_telegram_chat_id_telegram_chats_id_fk" FOREIGN KEY ("telegram_chat_id") REFERENCES "public"."telegram_chats"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_earthquake_event_id_earthquake_events_id_fk" FOREIGN KEY ("earthquake_event_id") REFERENCES "public"."earthquake_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_location_id_monitored_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."monitored_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitored_locations" ADD CONSTRAINT "monitored_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_chats" ADD CONSTRAINT "telegram_chats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_deliveries_alert_user_idx" ON "alert_deliveries" USING btree ("alert_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alerts_dedupe_idx" ON "alerts" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "alerts_user_idx" ON "alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "alerts_created_idx" ON "alerts" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_summaries_user_date_idx" ON "daily_summaries" USING btree ("user_id","summary_date");--> statement-breakpoint
CREATE UNIQUE INDEX "earthquake_events_usgs_idx" ON "earthquake_events" USING btree ("usgs_id");--> statement-breakpoint
CREATE INDEX "earthquake_events_time_idx" ON "earthquake_events" USING btree ("time");--> statement-breakpoint
CREATE INDEX "earthquake_events_magnitude_idx" ON "earthquake_events" USING btree ("magnitude");--> statement-breakpoint
CREATE INDEX "earthquake_events_lat_lng_idx" ON "earthquake_events" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE UNIQUE INDEX "geocoding_cache_query_idx" ON "geocoding_cache" USING btree (lower("query"));--> statement-breakpoint
CREATE INDEX "ingestion_runs_started_idx" ON "ingestion_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_status_idx" ON "ingestion_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "monitored_locations_user_idx" ON "monitored_locations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_chats_user_active_idx" ON "telegram_chats" USING btree ("user_id") WHERE "telegram_chats"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_chats_chat_active_idx" ON "telegram_chats" USING btree ("chat_id") WHERE "telegram_chats"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_link_tokens_hash_idx" ON "telegram_link_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "telegram_link_tokens_user_idx" ON "telegram_link_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree (lower("email"));