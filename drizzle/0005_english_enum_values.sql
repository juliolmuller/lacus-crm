ALTER TYPE "public"."niche_ticket" RENAME VALUE 'alto' TO 'high';--> statement-breakpoint
ALTER TYPE "public"."niche_ticket" RENAME VALUE 'medio' TO 'medium';--> statement-breakpoint
ALTER TYPE "public"."niche_ticket" RENAME VALUE 'baixo' TO 'low';--> statement-breakpoint
ALTER TYPE "public"."niche_openness" RENAME VALUE 'alta' TO 'high';--> statement-breakpoint
ALTER TYPE "public"."niche_openness" RENAME VALUE 'media' TO 'medium';--> statement-breakpoint
ALTER TYPE "public"."niche_openness" RENAME VALUE 'baixa' TO 'low';--> statement-breakpoint
UPDATE "settings" SET "value" = jsonb_set("value", '{ticketPoints}', jsonb_build_object('high', "value"->'ticketPoints'->'alto', 'medium', "value"->'ticketPoints'->'medio', 'low', "value"->'ticketPoints'->'baixo')) WHERE "key" = 'score_thresholds' AND "value" ? 'ticketPoints' AND "value"->'ticketPoints' ? 'alto';
