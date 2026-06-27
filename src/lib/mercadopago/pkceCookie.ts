export const PKCE_COOKIE = "mp_pkce";

export const pkceCookieOptions = {
  httpOnly: true as const,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/mp/oauth",
  maxAge: 600, // 10 min, matches state TTL
};
