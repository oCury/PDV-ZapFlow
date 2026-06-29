import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { currentPlan } from "@/lib/entitlements-guard";
import { allowedKeys } from "@/lib/entitlements";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const plan = (await currentPlan()) ?? "basic";
  return NextResponse.json({
    user: { id: session.userId, name: session.name, role: session.role },
    plan,
    entitlements: allowedKeys(plan),
  });
}
