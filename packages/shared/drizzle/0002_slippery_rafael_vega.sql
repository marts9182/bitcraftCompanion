CREATE TABLE IF NOT EXISTS "claims" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"region" text NOT NULL,
	"name" text NOT NULL,
	"owner_player_entity_id" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "empire_members" (
	"empire_entity_id" text NOT NULL,
	"player_entity_id" text NOT NULL,
	"region" text NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "empire_members_empire_entity_id_player_entity_id_pk" PRIMARY KEY("empire_entity_id","player_entity_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "empires" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"region" text NOT NULL,
	"name" text NOT NULL,
	"num_claims" integer DEFAULT 0 NOT NULL,
	"treasury" bigint DEFAULT 0 NOT NULL,
	"leader_player_entity_id" text,
	"member_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_skills" (
	"player_entity_id" text NOT NULL,
	"skill_id" integer NOT NULL,
	"region" text NOT NULL,
	"xp" bigint DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "player_skills_player_entity_id_skill_id_pk" PRIMARY KEY("player_entity_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "players" (
	"entity_id" text PRIMARY KEY NOT NULL,
	"region" text NOT NULL,
	"username" text NOT NULL,
	"time_played" integer DEFAULT 0 NOT NULL,
	"signed_in" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "regions" (
	"region" text PRIMARY KEY NOT NULL,
	"module" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "skills" (
	"id" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"max_level" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claims_region_idx" ON "claims" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "claims_owner_idx" ON "claims" USING btree ("owner_player_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "empire_members_empire_idx" ON "empire_members" USING btree ("empire_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "empire_members_player_idx" ON "empire_members" USING btree ("player_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "empires_region_idx" ON "empires" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_skills_rank_idx" ON "player_skills" USING btree ("region","skill_id","xp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "player_skills_player_idx" ON "player_skills" USING btree ("player_entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_region_idx" ON "players" USING btree ("region");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "players_username_idx" ON "players" USING btree ("username");