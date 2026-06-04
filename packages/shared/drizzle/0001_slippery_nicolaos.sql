CREATE TABLE IF NOT EXISTS "buildings" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"functions" jsonb,
	"icon_asset_name" text,
	"show_in_compendium" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cargo" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tier" integer,
	"rarity" text DEFAULT 'Default' NOT NULL,
	"tag" text,
	"volume" integer,
	"icon_asset_name" text,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_equipment" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"slots" jsonb,
	"stats" jsonb,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_food" (
	"item_id" integer PRIMARY KEY NOT NULL,
	"hp" real,
	"stamina" real,
	"hunger" real,
	"teleportation_energy" real,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tier" integer,
	"rarity" text DEFAULT 'Default' NOT NULL,
	"tag" text,
	"volume" integer,
	"durability" integer,
	"icon_asset_name" text,
	"compendium_entry" boolean DEFAULT true NOT NULL,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_inputs" (
	"recipe_id" integer NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipe_outputs" (
	"recipe_id" integer NOT NULL,
	"ref_type" text NOT NULL,
	"ref_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "recipes" (
	"id" integer PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"time_requirement" real,
	"stamina_requirement" real,
	"raw" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_equipment" ADD CONSTRAINT "item_equipment_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "item_food" ADD CONSTRAINT "item_food_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_inputs" ADD CONSTRAINT "recipe_inputs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "recipe_outputs" ADD CONSTRAINT "recipe_outputs_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "buildings_slug_idx" ON "buildings" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cargo_slug_idx" ON "cargo" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cargo_tier_idx" ON "cargo" USING btree ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cargo_rarity_idx" ON "cargo" USING btree ("rarity");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "items_slug_idx" ON "items" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_tier_idx" ON "items" USING btree ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_rarity_idx" ON "items" USING btree ("rarity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "items_tag_idx" ON "items" USING btree ("tag");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_inputs_recipe_idx" ON "recipe_inputs" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_inputs_ref_idx" ON "recipe_inputs" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_outputs_recipe_idx" ON "recipe_outputs" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipe_outputs_ref_idx" ON "recipe_outputs" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "recipes_slug_idx" ON "recipes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "recipes_type_idx" ON "recipes" USING btree ("type");