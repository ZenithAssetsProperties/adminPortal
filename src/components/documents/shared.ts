export const KIND_LABELS: Record<string, string> = {
  survey_plan: "Survey plan", deed_of_assignment: "Deed of assignment", certificate_of_occupancy: "Certificate of occupancy",
  governors_consent: "Governor's consent", allocation_letter: "Allocation letter", building_approval: "Building approval",
  approved_building_plan: "Approved building plan", title_document: "Title document", development_approval: "Development approval",
  receipt: "Receipt", purchase_agreement: "Purchase agreement", correspondence: "Correspondence", other: "Other",
};
export const kindLabel = (k: string) => KIND_LABELS[k] ?? k;
export const fmtSize = (b: number) => (b > 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

export type DocRow = {
  id: string; groupId: string; version: number; kind: string; title: string; status: string; visibility: string;
  propertyId: string | null; customerId: string | null; propertyName: string | null; customerName: string | null;
  mimeType: string; sizeBytes: number; createdAt: string; versionCount: number;
};
