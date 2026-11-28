CREATE TYPE "public"."consent_purpose" AS ENUM('marketing', 'analytics', 'kyc_processing', 'third_party_sharing', 'communications');--> statement-breakpoint
CREATE TYPE "public"."dsar_status" AS ENUM('pending', 'in_review', 'approved', 'completed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."dsar_type" AS ENUM('access', 'erasure', 'rectification', 'restriction', 'portability');--> statement-breakpoint
CREATE TYPE "public"."override_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "public"."pii_access_level" AS ENUM('full', 'masked', 'redacted');--> statement-breakpoint
CREATE TABLE "privacy_consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"granted" boolean DEFAULT false NOT NULL,
	"policy_version" text DEFAULT '2026.1' NOT NULL,
	"source" text DEFAULT 'web' NOT NULL,
	"ip" text,
	"granted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid,
	"subject_email" text NOT NULL,
	"type" "dsar_type" NOT NULL,
	"status" "dsar_status" DEFAULT 'pending' NOT NULL,
	"reason" text,
	"resolution_notes" text,
	"requested_by" text DEFAULT 'customer' NOT NULL,
	"assigned_to" uuid,
	"due_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"export_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_requests_reference_unique" UNIQUE("reference")
);
--> statement-breakpoint
CREATE TABLE "privacy_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text DEFAULT 'default' NOT NULL,
	"audit_log_retention_days" integer DEFAULT 365 NOT NULL,
	"inactive_customer_retention_days" integer DEFAULT 1095 NOT NULL,
	"dsar_sla_days" integer DEFAULT 30 NOT NULL,
	"mask_pii_by_default" boolean DEFAULT true NOT NULL,
	"enforce_ip_allowlist" boolean DEFAULT false NOT NULL,
	"anonymize_on_erasure" boolean DEFAULT true NOT NULL,
	"policy_version" text DEFAULT '2026.1' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "privacy_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "role_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "staff_role" NOT NULL,
	"permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pii_access_level" "pii_access_level" DEFAULT 'masked' NOT NULL,
	"require_mfa" boolean DEFAULT false NOT NULL,
	"session_ttl_minutes" integer DEFAULT 30 NOT NULL,
	"allowed_ip_cidrs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"description" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_policies_role_unique" UNIQUE("role")
);
--> statement-breakpoint
CREATE TABLE "staff_permission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"staff_id" uuid NOT NULL,
	"permission" text NOT NULL,
	"effect" "override_effect" DEFAULT 'allow' NOT NULL,
	"reason" text,
	"expires_at" timestamp with time zone,
	"granted_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_assigned_to_staff_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_settings" ADD CONSTRAINT "privacy_settings_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_policies" ADD CONSTRAINT "role_policies_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_permission_overrides" ADD CONSTRAINT "staff_permission_overrides_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_permission_overrides" ADD CONSTRAINT "staff_permission_overrides_granted_by_staff_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_consent_customer_purpose_unique" ON "privacy_consents" USING btree ("customer_id","purpose");--> statement-breakpoint
CREATE INDEX "privacy_consent_purpose_idx" ON "privacy_consents" USING btree ("purpose","granted");--> statement-breakpoint
CREATE INDEX "privacy_requests_status_idx" ON "privacy_requests" USING btree ("status","due_at");--> statement-breakpoint
CREATE INDEX "privacy_requests_customer_idx" ON "privacy_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_perm_override_unique" ON "staff_permission_overrides" USING btree ("staff_id","permission");--> statement-breakpoint
CREATE INDEX "staff_perm_override_staff_idx" ON "staff_permission_overrides" USING btree ("staff_id");--> statement-breakpoint
CREATE INDEX "documents_property_idx" ON "documents" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "documents_status_idx" ON "documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enquiries_handled_idx" ON "enquiries" USING btree ("handled");--> statement-breakpoint
CREATE INDEX "enquiries_created_idx" ON "enquiries" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "enquiries_property_idx" ON "enquiries" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "inspections_customer_idx" ON "inspections" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "inspections_property_idx" ON "inspections" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "inspections_status_idx" ON "inspections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "inspections_assigned_idx" ON "inspections" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "inspections_date_idx" ON "inspections" USING btree ("preferred_date");--> statement-breakpoint
CREATE INDEX "notifications_customer_idx" ON "notifications" USING btree ("customer_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_staff_idx" ON "notifications" USING btree ("staff_id","read_at");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_status_idx" ON "payments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payments_created_idx" ON "payments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "properties_status_type_idx" ON "properties" USING btree ("status","type");--> statement-breakpoint
CREATE INDEX "properties_featured_idx" ON "properties" USING btree ("featured");--> statement-breakpoint
CREATE INDEX "properties_created_idx" ON "properties" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "properties_price_idx" ON "properties" USING btree ("price_kobo");--> statement-breakpoint
CREATE INDEX "rate_limits_reset_idx" ON "rate_limits" USING btree ("reset_at");--> statement-breakpoint
CREATE INDEX "reservations_status_expires_idx" ON "reservations" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "reservations_property_idx" ON "reservations" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "reservations_customer_idx" ON "reservations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "tx_property_idx" ON "transactions" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "tx_agent_idx" ON "transactions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "tx_stage_idx" ON "transactions" USING btree ("stage");