CREATE TABLE IF NOT EXISTS "claim_members" (
	"claim_entity_id" text NOT NULL,
	"player_entity_id" text NOT NULL,
	"region" text NOT NULL,
	"claim_name" text DEFAULT '' NOT NULL,
	"co_owner" boolean DEFAULT false NOT NULL,
	"officer" boolean DEFAULT false NOT NULL,
	"build" boolean DEFAULT false NOT NULL,
	"inventory" boolean DEFAULT false NOT NULL,
	CONSTRAINT "claim_members_claim_entity_id_player_entity_id_pk" PRIMARY KEY("claim_entity_id","player_entity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "empire_towers" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"empire_entity_id" text NOT NULL,
	"region" text NOT NULL,
	"chunk_index" text NOT NULL,
	"energy" bigint DEFAULT 0 NOT NULL,
	"upkeep" bigint DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "empire_members" ADD COLUMN "noble" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "empire_members" ADD COLUMN "donated_shards" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "empire_members" ADD COLUMN "donated_currency" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "empires" ADD COLUMN "currency_treasury" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "empires" ADD COLUMN "nobility_threshold" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "empires" ADD COLUMN "owner_type" integer;--> statement-breakpoint
ALTER TABLE "empires" ADD COLUMN "tower_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "empires" ADD COLUMN "tower_energy" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "empires" ADD COLUMN "tower_upkeep" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "time_signed_in" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "sign_in_timestamp" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claim_members_player_idx" ON "claim_members" USING btree ("player_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claim_members_region_idx" ON "claim_members" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "empire_towers_empire_idx" ON "empire_towers" USING btree ("empire_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "empire_towers_region_idx" ON "empire_towers" USING btree ("region");