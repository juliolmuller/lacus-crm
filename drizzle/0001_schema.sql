CREATE TYPE "public"."actor_source" AS ENUM('ui', 'mcp', 'rule', 'import');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('new', 'to_contact', 'contacted', 'no_response', 'replied', 'negotiating', 'client', 'lost', 'discarded');--> statement-breakpoint
CREATE TYPE "public"."deal_status" AS ENUM('open', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."followup_trigger" AS ENUM('deal_created', 'deal_stage_entered', 'interaction_logged');--> statement-breakpoint
CREATE TYPE "public"."google_status" AS ENUM('active', 'needs_reauth', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."interaction_created_by" AS ENUM('user', 'mcp', 'rule', 'import');--> statement-breakpoint
CREATE TYPE "public"."interaction_direction" AS ENUM('outbound', 'inbound', 'internal');--> statement-breakpoint
CREATE TYPE "public"."interaction_outcome" AS ENUM('no_answer', 'replied', 'interested', 'not_interested', 'asked_later', 'meeting_set', 'proposal_requested', 'opt_out');--> statement-breakpoint
CREATE TYPE "public"."interaction_type" AS ENUM('whatsapp', 'call', 'email', 'instagram_dm', 'in_person', 'meeting', 'proposal', 'note', 'system');--> statement-breakpoint
CREATE TYPE "public"."niche_openness" AS ENUM('alta', 'media', 'baixa');--> statement-breakpoint
CREATE TYPE "public"."niche_ticket" AS ENUM('alto', 'medio', 'baixo');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('pending', 'done', 'error');--> statement-breakpoint
CREATE TYPE "public"."reminder_source" AS ENUM('manual', 'rule', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."reminder_status" AS ENUM('open', 'done', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'synced', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."template_channel" AS ENUM('whatsapp', 'email', 'instagram');--> statement-breakpoint
CREATE TYPE "public"."view_scope" AS ENUM('leads', 'deals');--> statement-breakpoint
CREATE TYPE "public"."website_status" AS ENUM('none', 'social_only', 'bad', 'good', 'unknown');--> statement-breakpoint
CREATE TABLE "followup_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"trigger" "followup_trigger" NOT NULL,
	"stage_id" integer,
	"interaction_outcome" "interaction_outcome",
	"interaction_direction" "interaction_direction",
	"interaction_type" "interaction_type",
	"cadence" jsonb NOT NULL,
	"cancel_on" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"deal_id" uuid,
	"type" "interaction_type" NOT NULL,
	"direction" "interaction_direction" NOT NULL,
	"outcome" "interaction_outcome",
	"summary" text NOT NULL,
	"body" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"template_id" integer,
	"created_by" "interaction_created_by" DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"channel" "template_channel" NOT NULL,
	"niche_id" integer,
	"stage_id" integer,
	"body" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "message_templates_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"deal_id" uuid,
	"title" text NOT NULL,
	"notes" text,
	"due_at" timestamp with time zone NOT NULL,
	"duration_min" integer DEFAULT 15 NOT NULL,
	"status" "reminder_status" DEFAULT 'open' NOT NULL,
	"completed_at" timestamp with time zone,
	"snooze_count" integer DEFAULT 0 NOT NULL,
	"source" "reminder_source" DEFAULT 'manual' NOT NULL,
	"rule_id" integer,
	"dedupe_key" text,
	"google_calendar_id" text,
	"google_event_id" text,
	"sync_status" "sync_status" DEFAULT 'pending' NOT NULL,
	"sync_attempts" integer DEFAULT 0 NOT NULL,
	"sync_error" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reminders_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
CREATE TABLE "auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"ticket" "niche_ticket",
	"openness" "niche_openness",
	"why_buys" text,
	"first_offer" text,
	"priority" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "niches_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "regions" (
	"id" serial PRIMARY KEY NOT NULL,
	"state" char(2) NOT NULL,
	"city" text NOT NULL,
	"neighborhood" text,
	"label" text NOT NULL,
	"source_sheet_id" text,
	CONSTRAINT "regions_label_unique" UNIQUE("label")
);
--> statement-breakpoint
CREATE TABLE "deal_stage_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"deal_id" uuid NOT NULL,
	"from_stage_id" integer,
	"to_stage_id" integer NOT NULL,
	"moved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" "actor_source" DEFAULT 'ui' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deal_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort" integer NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"default_probability" integer,
	"archived_at" timestamp with time zone,
	"lead_status" "contact_status",
	CONSTRAINT "deal_stages_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"stage_id" integer NOT NULL,
	"title" text NOT NULL,
	"position" text collate "C" NOT NULL,
	"value" numeric(12, 2),
	"probability" integer,
	"service_type" text,
	"expected_close_on" date,
	"status" "deal_status" DEFAULT 'open' NOT NULL,
	"lost_reason" text,
	"won_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"niche_id" integer NOT NULL,
	"region_id" integer NOT NULL,
	"phone" text,
	"has_whatsapp" boolean DEFAULT false,
	"email" text,
	"decision_maker_contact" text,
	"website_url" text,
	"website_status" "website_status" DEFAULT 'unknown',
	"instagram" text,
	"other_socials" text,
	"maps_url" text,
	"maps_rating" numeric(2, 1),
	"maps_reviews" integer,
	"owner_replies_reviews" boolean,
	"complaints" text,
	"cnpj_opened_at" date,
	"years_in_business" integer,
	"company_size" text,
	"has_active_ads" boolean DEFAULT false,
	"instagram_active" boolean DEFAULT false,
	"strong_local_competition" boolean DEFAULT false,
	"score" integer DEFAULT 0 NOT NULL,
	"contact_status" "contact_status" DEFAULT 'new' NOT NULL,
	"last_contact_at" timestamp with time zone,
	"channel" text,
	"response_or_objection" text,
	"next_action" text,
	"proposal_value" numeric(12, 2),
	"notes" text,
	"included_at" date DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
	"place_id" text,
	"maps_category" text,
	"address" text,
	"digital_signals" text,
	"business_summary" text,
	"pitch" text,
	"priority" integer,
	"session_url" text,
	"do_not_contact" boolean DEFAULT false NOT NULL,
	"source_sheet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"phone_e164" text,
	"name_normalized" text,
	"score_breakdown" jsonb,
	"score_computed_at" timestamp with time zone,
	"contact_status_changed_at" timestamp with time zone,
	"do_not_contact_reason" text,
	"do_not_contact_at" timestamp with time zone,
	"data_source" text,
	CONSTRAINT "leads_place_id_unique" UNIQUE("place_id")
);
--> statement-breakpoint
CREATE TABLE "api_usage_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"day" date NOT NULL,
	"at" time NOT NULL,
	"queue_position" integer,
	"requests" integer DEFAULT 0 NOT NULL,
	"leads_saved" integer DEFAULT 0 NOT NULL,
	"note" text,
	"run_id" text,
	CONSTRAINT "api_usage_log_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "prospecting_queue" (
	"position" integer PRIMARY KEY NOT NULL,
	"region_id" integer NOT NULL,
	"niche_id" integer NOT NULL,
	"status" "queue_status" DEFAULT 'pending' NOT NULL,
	"executed_at" timestamp with time zone,
	"leads_added" integer DEFAULT 0,
	"notes" text,
	"sort_order" integer NOT NULL,
	"skipped_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0,
	CONSTRAINT "prospecting_queue_region_niche_unique" UNIQUE("region_id","niche_id")
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"token_prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] NOT NULL,
	"last_used_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"action" text NOT NULL,
	"actor" text NOT NULL,
	"diff" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_connections" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_email" text NOT NULL,
	"refresh_token_enc" text NOT NULL,
	"access_token_enc" text,
	"access_token_expires_at" timestamp with time zone,
	"scope" text,
	"calendar_id" text,
	"status" "google_status" DEFAULT 'active' NOT NULL,
	"last_error" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job" text NOT NULL,
	"execution_id" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"error" text,
	CONSTRAINT "job_runs_execution_id_unique" UNIQUE("execution_id")
);
--> statement-breakpoint
CREATE TABLE "saved_views" (
	"id" serial PRIMARY KEY NOT NULL,
	"scope" "view_scope" NOT NULL,
	"name" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppression_list" (
	"id" serial PRIMARY KEY NOT NULL,
	"place_id" text,
	"phone_e164_hash" text,
	"name_region_hash" text,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "followup_rules" ADD CONSTRAINT "followup_rules_stage_id_deal_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."deal_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interactions" ADD CONSTRAINT "interactions_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_stage_id_deal_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."deal_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_rule_id_followup_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."followup_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_from_stage_id_deal_stages_id_fk" FOREIGN KEY ("from_stage_id") REFERENCES "public"."deal_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deal_stage_history" ADD CONSTRAINT "deal_stage_history_to_stage_id_deal_stages_id_fk" FOREIGN KEY ("to_stage_id") REFERENCES "public"."deal_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_stage_id_deal_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."deal_stages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospecting_queue" ADD CONSTRAINT "prospecting_queue_region_id_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."regions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospecting_queue" ADD CONSTRAINT "prospecting_queue_niche_id_niches_id_fk" FOREIGN KEY ("niche_id") REFERENCES "public"."niches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interactions_lead_occurred_idx" ON "interactions" USING btree ("lead_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "interactions_deal_occurred_idx" ON "interactions" USING btree ("deal_id","occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reminders_status_due_idx" ON "reminders" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "reminders_lead_id_idx" ON "reminders" USING btree ("lead_id");--> statement-breakpoint
CREATE INDEX "reminders_sync_pending_idx" ON "reminders" USING btree ("sync_status") WHERE "reminders"."sync_status" in ('pending','error');--> statement-breakpoint
CREATE INDEX "auth_accounts_userId_idx" ON "auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_userId_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_verifications_identifier_idx" ON "auth_verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "deals_stage_position_idx" ON "deals" USING btree ("stage_id","position");--> statement-breakpoint
CREATE INDEX "deals_lead_id_idx" ON "deals" USING btree ("lead_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deals_one_open_per_lead_idx" ON "deals" USING btree ("lead_id") WHERE "deals"."status" = 'open';--> statement-breakpoint
CREATE INDEX "leads_contact_status_idx" ON "leads" USING btree ("contact_status");--> statement-breakpoint
CREATE INDEX "leads_niche_id_idx" ON "leads" USING btree ("niche_id");--> statement-breakpoint
CREATE INDEX "leads_region_id_idx" ON "leads" USING btree ("region_id");--> statement-breakpoint
CREATE INDEX "leads_score_idx" ON "leads" USING btree ("score" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_phone_e164_idx" ON "leads" USING btree ("phone_e164");--> statement-breakpoint
CREATE INDEX "leads_name_normalized_trgm_idx" ON "leads" USING gin ("name_normalized" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "leads_updated_at_idx" ON "leads" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_do_not_contact_idx" ON "leads" USING btree ("id") WHERE "leads"."do_not_contact";--> statement-breakpoint
CREATE INDEX "api_usage_log_day_idx" ON "api_usage_log" USING btree ("day");--> statement-breakpoint
CREATE INDEX "prospecting_queue_status_sort_idx" ON "prospecting_queue" USING btree ("status","sort_order");--> statement-breakpoint
CREATE INDEX "suppression_place_id_idx" ON "suppression_list" USING btree ("place_id");--> statement-breakpoint
CREATE INDEX "suppression_phone_hash_idx" ON "suppression_list" USING btree ("phone_e164_hash");--> statement-breakpoint
CREATE INDEX "suppression_name_region_hash_idx" ON "suppression_list" USING btree ("name_region_hash");