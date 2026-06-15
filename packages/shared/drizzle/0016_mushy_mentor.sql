CREATE TABLE IF NOT EXISTS "region_events" (
	"region" text NOT NULL,
	"event_type" text NOT NULL,
	"ends_at" timestamp NOT NULL,
	"entity_id" text NOT NULL,
	"x" integer,
	"z" integer,
	"dimension" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "region_events_region_event_type_pk" PRIMARY KEY("region","event_type")
);
