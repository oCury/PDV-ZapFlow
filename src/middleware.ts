import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionFromRequest } from "@/lib/auth-edge";

const PUBLIC_PATHS = [
  "/",
  "/cadastro",
  "/login",
  "/assinar",
  "/signup/sucesso",
  "/api/auth/login",
  "/api/signup/checkout",
  "/api/signup/status",
  "/api/webhooks/infinitepay",
];
const EMPLOYEE_ALLOWED_PAGES = ["/pdv", "/products"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  // Let all API routes through -- each endpoint handles its own auth
  if (pathname.startsWith("/api/")) return NextResponse.next();

  const session = await getSessionFromRequest(req);

  if (!session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (session.role === "EMPLOYEE") {
    const isAllowed = EMPLOYEE_ALLOWED_PAGES.some(
      (p) => pathname === p || pathname.startsWith(p + "/")
    );

    if (!isAllowed) {
      return NextResponse.redirect(new URL("/pdv", req.url));
    }
  }

  // Subscription gate: lapsed paid_until -> /assinar (data preserved). null/absent paidUntil => never gated.
  if (!pathname.startsWith("/api/")) {
    const t = session.paidUntil;
    if (t && new Date(t).getTime() < Date.now() && pathname !== "/assinar") {
      return NextResponse.redirect(new URL("/assinar", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico)$).*)",
  ],
};
