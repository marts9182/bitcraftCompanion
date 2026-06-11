CREATE TABLE IF NOT EXISTS "market_trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"item_type" text NOT NULL,
	"region" integer NOT NULL,
	"price" bigint NOT NULL,
	"quantity" integer NOT NULL,
	"side" text NOT NULL,
	"kind" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_trades_item_idx" ON "market_trades" USING btree ("item_id","item_type","observed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "market_trades_region_idx" ON "market_trades" USING btree ("region","observed_at");