CREATE TYPE "public"."vetting_stage" AS ENUM('intake_scan', 'registry_check', 'physical_match', 'final_seal', 'rejected');--> statement-breakpoint
CREATE TABLE "document_vetting_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"stage" "vetting_stage" NOT NULL,
	"passed" boolean NOT NULL,
	"notes" text,
	"checklist" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "issuing_authority" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "registry_ref" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "issued_date" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "expires_at" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "vetting_checklist" jsonb;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "review_notes" text;--> statement-breakpoint
ALTER TABLE "privacy_settings" ADD COLUMN "enforce_maker_checker" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "document_vetting_logs" ADD CONSTRAINT "document_vetting_logs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_vetting_logs" ADD CONSTRAINT "document_vetting_logs_reviewer_id_staff_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "doc_vetting_logs_doc_idx" ON "document_vetting_logs" USING btree ("document_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_registry_ref_idx" ON "documents" USING btree ("registry_ref");