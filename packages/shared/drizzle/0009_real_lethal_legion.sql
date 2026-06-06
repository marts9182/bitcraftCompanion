CREATE TABLE IF NOT EXISTS "market_item_summary" (
	"item_id" integer NOT NULL,
	"item_type" integer NOT NULL,
	"item_name" text DEFAULT '' NOT NULL,
	"item_slug" text DEFAULT '' NOT NULL,
	"icon_asset_name" text,
	"tier" integer,
	"rarity" text DEFAULT 'Default' NOT NULL,
	"lowest_ask" bigint,
	"highest_bid" bigint,
	"ask_qty" integer DEFAULT 0 NOT NULL,
	"bid_qty" integer DEFAULT 0 NOT NULL,
	"ask_order_count" integer DEFAULT 0 NOT NULL,
	"bid_order_count" integer DEFAULT 0 NOT NULL,
	"region_count" integer DEFAULT 0 NOT NULL,
	"marketplace_count" integer DEFAULT 0 NOT NULL,
	"sold_qty_recent" integer DEFAULT 0 NOT NULL,
	"last_sold_at" bigint,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "market_item_summary_item_id_item_type_pk" PRIMARY KEY("item_id","item_type")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_orders" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"region" text NOT NULL,
	"side" text NOT NULL,
	"item_id" integer NOT NULL,
	"item_type" integer DEFAULT 0 NOT NULL,
	"claim_entity_id" text,
	"owner_entity_id" text,
	"price" bigint DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"stored_coins" bigint DEFAULT 0 NOT NULL,
	"timestamp" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_price_history" (
	"item_id" integer NOT NULL,
	"item_type" integer NOT NULL,
	"snapshot_at" timestamp NOT NULL,
	"lowest_ask" bigint,
	"highest_bid" bigint,
	"ask_qty" integer DEFAULT 0 NOT NULL,
	"bid_qty" integer DEFAULT 0 NOT NULL,
	"sold_qty_recent" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "market_price_history_item_id_item_type_snapshot_at_pk" PRIMARY KEY("item_id","item_type","snapshot_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "market_sales" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"region" text NOT NULL,
	"item_id" integer NOT NULL,
	"item_type" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"owner_entity_id" text,
	"claim_entity_id" text,
	"timestamp" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketplaces" (
	"building_entity_id" text PRIMARY KEY NOT NULL,
	"claim_entity_id" text,
	"region" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_summary_ask_idx" ON "market_item_summary" USING btree ("lowest_ask");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_summary_sold_idx" ON "market_item_summary" USING btree ("sold_qty_recent");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_summary_tier_idx" ON "market_item_summary" USING btree ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_summary_rarity_idx" ON "market_item_summary" USING btree ("rarity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_summary_name_idx" ON "market_item_summary" USING btree ("item_name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_orders_item_idx" ON "market_orders" USING btree ("item_id","item_type","side","price");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_orders_region_idx" ON "market_orders" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_orders_claim_idx" ON "market_orders" USING btree ("claim_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_history_item_idx" ON "market_price_history" USING btree ("item_id","item_type","snapshot_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_sales_item_idx" ON "market_sales" USING btree ("item_id","item_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_sales_region_idx" ON "market_sales" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_sales_time_idx" ON "market_sales" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplaces_region_idx" ON "marketplaces" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "marketplaces_claim_idx" ON "marketplaces" USING btree ("claim_entity_id");