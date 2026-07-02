import type { ReactNode } from "react";

/**
 * Marketing (public) layout — light theme, no AppShell.
 * Locally overrides the app's global dark body so the landing + cadastro
 * render on the landing's light design tokens (Rubik/Nunito, white surfaces).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: "var(--color-bg)",
        color: "var(--color-body)",
        minHeight: "100dvh",
        fontFamily: "var(--font-body)",
      }}
    >
      {children}
    </div>
  );
}
