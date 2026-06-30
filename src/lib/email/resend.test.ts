import { describe, it, expect, vi, beforeEach } from "vitest";
const send = vi.fn();
vi.mock("resend", () => ({ Resend: class { emails = { send: (a: unknown) => send(a) }; } }));
beforeEach(() => { send.mockReset(); process.env.RESEND_API_KEY = "re_test"; process.env.EMAIL_FROM = "no-reply@zap.test"; });

import { sendVerificationEmail } from "./resend";

describe("sendVerificationEmail", () => {
  it("sends to the address with the link in the body and subject", async () => {
    send.mockResolvedValue({ data: { id: "e1" }, error: null });
    await sendVerificationEmail({ to: "a@b.com", name: "Ana", link: "https://app/verify?token=xyz" });
    const arg = send.mock.calls[0][0] as { from: string; to: string; subject: string; html: string };
    expect(arg.to).toBe("a@b.com");
    expect(arg.from).toBe("no-reply@zap.test");
    expect(arg.html).toContain("https://app/verify?token=xyz");
    expect(arg.subject).toMatch(/confirm/i);
  });
  it("throws when Resend returns an error", async () => {
    send.mockResolvedValue({ data: null, error: { message: "bad" } });
    await expect(sendVerificationEmail({ to: "a@b.com", name: "Ana", link: "x" })).rejects.toThrow();
  });
});
