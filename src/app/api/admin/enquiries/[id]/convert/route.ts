import { adminRoute, conflict, getIp } from "@/lib/http";
import { isScopedToOwn } from "@/lib/rbac";
import { audit } from "@/lib/audit";
import { requireUuid } from "../../../agents/_id";
import { convertToLead } from "../../_convert";
import { loadEnquiry } from "../../_load";

export const POST = adminRoute("enquiries.write", async ({ req, staff, params }) => {
  const enq = await loadEnquiry(requireUuid(params.id), staff);
  if (enq.leadId) throw conflict("This enquiry is already linked to a lead");
  const lead = await convertToLead(enq, isScopedToOwn(staff.role) ? staff.id : null);
  await audit({ type: "staff", id: staff.id }, "enquiry.convert", { entity: "enquiry", entityId: enq.id, meta: { leadId: lead.id }, ip: getIp(req) });
  return Response.json(lead, { status: 201 });
});
