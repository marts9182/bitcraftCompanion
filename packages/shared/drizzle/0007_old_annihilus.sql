ALTER TABLE "empires" ADD COLUMN "foundry_capsules" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "empires" ADD COLUMN "foundry_queued" bigint DEFAULT 0 NOT NULL;