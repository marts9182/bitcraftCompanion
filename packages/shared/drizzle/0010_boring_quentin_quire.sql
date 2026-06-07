CREATE TABLE IF NOT EXISTS "settlement_supply_history" (
	"settlement_entity_id" text NOT NULL,
	"snapshot_at" timestamp NOT NULL,
	"supplies" bigint DEFAULT 0 NOT NULL,
	"treasury" bigint DEFAULT 0 NOT NULL,
	"building_maintenance" real DEFAULT 0 NOT NULL,
	"num_tiles" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "settlement_supply_history_settlement_entity_id_snapshot_at_pk" PRIMARY KEY("settlement_entity_id","snapshot_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "settlements" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"region" text NOT NULL,
	"name" text NOT NULL,
	"owner_player_entity_id" text,
	"empire_entity_id" text,
	"x" integer DEFAULT 0 NOT NULL,
	"z" integer DEFAULT 0 NOT NULL,
	"dimension" integer DEFAULT 0 NOT NULL,
	"num_tiles" integer DEFAULT 0 NOT NULL,
	"num_tile_neighbors" integer DEFAULT 0 NOT NULL,
	"supplies" bigint DEFAULT 0 NOT NULL,
	"supplies_purchase_threshold" bigint DEFAULT 0 NOT NULL,
	"supplies_purchase_price" bigint DEFAULT 0 NOT NULL,
	"building_maintenance" real DEFAULT 0 NOT NULL,
	"treasury" bigint DEFAULT 0 NOT NULL,
	"xp_since_minting" bigint DEFAULT 0 NOT NULL,
	"can_house_storehouse" boolean DEFAULT false NOT NULL,
	"members_donations" bigint DEFAULT 0 NOT NULL,
	"member_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlement_history_entity_idx" ON "settlement_supply_history" USING btree ("settlement_entity_id","snapshot_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_region_idx" ON "settlements" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_tiles_idx" ON "settlements" USING btree ("num_tiles");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_supplies_idx" ON "settlements" USING btree ("supplies");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_treasury_idx" ON "settlements" USING btree ("treasury");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_name_idx" ON "settlements" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_owner_idx" ON "settlements" USING btree ("owner_player_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "settlements_empire_idx" ON "settlements" USING btree ("empire_entity_id");