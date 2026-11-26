UPDATE "settings" SET "value" = jsonb_set("value", '{ticketPoints}', jsonb_build_object('alto', "value"->'ticketPoints'->'high', 'medio', "value"->'ticketPoints'->'medium', 'baixo', "value"->'ticketPoints'->'low')) WHERE "key" = 'score_thresholds' AND "value" ? 'ticketPoints' AND "value"->'ticketPoints' ? 'high';--> statement-breakpoint
ALTER TYPE "public"."niche_openness" RENAME VALUE 'low' TO 'baixa';--> statement-breakpoint
ALTER TYPE "public"."niche_openness" RENAME VALUE 'medium' TO 'media';--> statement-breakpoint
ALTER TYPE "public"."niche_openness" RENAME VALUE 'high' TO 'alta';--> statement-breakpoint
ALTER TYPE "public"."niche_ticket" RENAME VALUE 'low' TO 'baixo';--> statement-breakpoint
ALTER TYPE "public"."niche_ticket" RENAME VALUE 'medium' TO 'medio';--> statement-breakpoint
ALTER TYPE "public"."niche_ticket" RENAME VALUE 'high' TO 'alto';
