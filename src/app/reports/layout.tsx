import { requireEntitlementPage } from "@/lib/entitlements-guard";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireEntitlementPage("reports.advanced");
  return <>{children}</>;
}
