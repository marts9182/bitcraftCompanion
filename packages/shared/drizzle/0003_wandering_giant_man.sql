CREATE TABLE IF NOT EXISTS "map_chunks" (
	"chunk_index" text PRIMARY KEY NOT NULL,
	"empire_entity_id" text NOT NULL,
	"watchtower_entity_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "map_claims" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"x" integer NOT NULL,
	"z" integer NOT NULL,
	"dimension" integer DEFAULT 1 NOT NULL,
	"num_tiles" integer DEFAULT 0 NOT NULL,
	"treasury" bigint DEFAULT 0 NOT NULL,
	"supplies" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "map_regions" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text,
	"min_chunk_x" integer NOT NULL,
	"min_chunk_z" integer NOT NULL,
	"width_chunks" integer NOT NULL,
	"height_chunks" integer NOT NULL,
	"region_index" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_chunks_empire_idx" ON "map_chunks" USING btree ("empire_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "map_claims_xz_idx" ON "map_claims" USING btree ("x","z");