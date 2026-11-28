CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending_review', 'agent_assigned', 'verified', 'rejected');--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "sha256_hash" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "integrity_seal" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "fraud_flag" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "last_verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "verification_status" "verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "verification_hash" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_verified_by_staff_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_sha256_idx" ON "documents" USING btree ("sha256_hash");