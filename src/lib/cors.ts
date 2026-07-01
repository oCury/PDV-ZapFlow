const ALLOWED = new Set([
  "https://zapflow-landing.vercel.app",
  // add the production landing domain here when it exists
]);

export function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && ALLOWED.has(origin) ? origin : "https://zapflow-landing.vercel.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}
