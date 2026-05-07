import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FiscalService } from "@/lib/fiscal/FiscalService";
import type { FiscalWebhookEvent } from "@/lib/fiscal/types";

/**
 * POST /api/fiscal/webhook
 *
 * Receives asynchronous status updates from the fiscal API (FocusNFe / PlugNotas)
 * after NFC-e processing. The fiscal provider must be configured to POST events
 * to this endpoint with a shared secret in the Authorization header.
 *
 * Event types:
 *  - nfce.authorized  → persist access key + DANFE URL on the Sale
 *  - nfce.error       → log the error for operator review
 *  - nfce.cancelled   → mark as cancelled
 */
export async function POST(req: Request) {
  // ── Signature / secret verification (mandatory) ────────────────────────────
  const secret = req.headers.get("x-webhook-secret");
  if (!process.env.FISCAL_WEBHOOK_SECRET || secret !== process.env.FISCAL_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: FiscalWebhookEvent;
  try {
    event = (await req.json()) as FiscalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { referenceId, accessKey, qrCodeUrl, danfeUrl, errors } = event;

  switch (event.event) {
    case "nfce.authorized": {
      await prisma.sale
        .update({
          where: { id: referenceId },
          data: {
            nfce_status: "authorized",
            nfce_access_key: accessKey ?? null,
            nfce_qr_url: qrCodeUrl ?? null,
            nfce_danfe_url: danfeUrl ?? null,
            nfce_protocol: (event as unknown as Record<string, unknown>).protocol as string ?? null,
          },
        })
        .catch((err) => {
          console.error(
            `[Fiscal] Failed to update sale ${referenceId}:`,
            err
          );
        });

      await FiscalService.logEvent(referenceId, "authorized", {
        accessKey,
        qrCodeUrl,
        danfeUrl,
      });

      // Mark queue item as SENT if it exists
      await prisma.fiscalQueue
        .updateMany({
          where: { sale_id: referenceId, status: { not: "SENT" } },
          data: { status: "SENT" },
        })
        .catch(() => {
          // Queue item may not exist — that's fine
        });

      break;
    }

    case "nfce.error": {
      const errorsJson = errors ? JSON.stringify(errors) : null;

      await prisma.sale
        .update({
          where: { id: referenceId },
          data: {
            nfce_status: "error",
            nfce_errors: errorsJson,
          },
        })
        .catch((err) => {
          console.error(
            `[Fiscal] Failed to update sale ${referenceId}:`,
            err
          );
        });

      await FiscalService.logEvent(referenceId, "error", { errors });

      break;
    }

    case "nfce.cancelled": {
      await prisma.sale
        .update({
          where: { id: referenceId },
          data: { nfce_status: "cancelled" },
        })
        .catch((err) => {
          console.error(
            `[Fiscal] Failed to update sale ${referenceId}:`,
            err
          );
        });

      await FiscalService.logEvent(referenceId, "cancelled", {});

      break;
    }

    default: {
      console.warn("[Fiscal] Unknown webhook event:", event);
    }
  }

  // Always return 200 so the provider doesn't retry
  return NextResponse.json({ received: true });
}
