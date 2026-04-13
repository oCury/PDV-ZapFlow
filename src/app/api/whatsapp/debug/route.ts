import { NextResponse } from "next/server";

/**
 * GET /api/whatsapp/debug
 * Simple diagnostic endpoint to verify API connectivity
 */
export async function GET() {
  const apiUrl = process.env.EVOLUTION_API_URL || "";
  const apiKey = process.env.EVOLUTION_API_KEY || "";
  const instanceName = process.env.EVOLUTION_INSTANCE_NAME || "";

  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    envConfigured: !!(apiUrl && apiKey && instanceName),
    apiUrl: apiUrl ? apiUrl.substring(0, 30) + "..." : "(empty)",
    instanceName,
  };

  if (!apiUrl || !apiKey) {
    result.error = "Missing EVOLUTION_API_URL or EVOLUTION_API_KEY";
    return NextResponse.json(result);
  }

  // Test 1: fetch instances
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, "")}/instance/fetchInstances`, {
      method: "GET",
      headers: { "Content-Type": "application/json", apikey: apiKey },
    });
    result.fetchStatus = res.status;
    result.fetchOk = res.ok;
    if (res.ok) {
      const data = await res.json();
      result.instanceCount = Array.isArray(data) ? data.length : "not-array";
      result.instanceNames = Array.isArray(data) ? data.map((i: { name?: string }) => i.name) : [];
    } else {
      result.fetchBody = await res.text().catch(() => "(unreadable)");
    }
  } catch (err) {
    result.fetchError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result);
}
