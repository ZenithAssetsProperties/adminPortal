import { redirect } from "next/navigation";
import AdminShell from "@/components/AdminShell";
import { currentStaff } from "@/lib/http";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await currentStaff();
  if (!session) redirect("/login");
  const { name, email, role } = session.staff;
  return <AdminShell user={{ name, email, role }}>{children}</AdminShell>;
}
