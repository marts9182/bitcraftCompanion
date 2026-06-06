ALTER TABLE "players" ADD COLUMN "total_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "total_xp" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_total_level_idx" ON "players" USING btree ("total_level");