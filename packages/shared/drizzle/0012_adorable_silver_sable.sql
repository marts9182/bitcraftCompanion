CREATE TABLE IF NOT EXISTS "creatures" (
	"enemy_type" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tier" integer,
	"rarity" text DEFAULT 'Default' NOT NULL,
	"huntable" boolean DEFAULT false NOT NULL,
	"max_health" integer,
	"min_damage" integer,
	"max_damage" integer,
	"armor" integer,
	"accuracy" integer,
	"evasion" integer,
	"attack_level" integer,
	"defense_level" integer,
	"health_regen" real,
	"day_detect_range" integer,
	"day_aggro_range" integer,
	"night_detect_range" integer,
	"night_aggro_range" integer,
	"icon_asset_name" text,
	"loot_stacks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spawn_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "resources" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text,
	"tier" integer,
	"rarity" text DEFAULT 'Default' NOT NULL,
	"max_health" integer,
	"respawn_seconds" real,
	"not_respawning" boolean DEFAULT false NOT NULL,
	"compendium_entry" boolean DEFAULT true NOT NULL,
	"icon_asset_name" text,
	"yields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spawn_counts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "creatures_slug_idx" ON "creatures" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "resources_slug_idx" ON "resources" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_category_idx" ON "resources" USING btree ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_tier_idx" ON "resources" USING btree ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "resources_compendium_idx" ON "resources" USING btree ("compendium_entry");