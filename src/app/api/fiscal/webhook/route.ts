import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  // ── Signature / secret verification ────────────────────────────────────────
  const secret = req.headers.get("x-webhook-secret");
  if (
    process.env.FISCAL_WEBHOOK_SECRET &&
    secret !== process.env.FISCAL_WEBHOOK_SECRET
  ) {
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
      // TODO: add nfce_access_key, nfce_qr_url, nfce_danfe_url columns to
      // the Sale model to persist these values per-sale.
      console.info(
        `[Fiscal] NFC-e authorized for sale ${referenceId}. Key: ${accessKey}`
      );

      // Placeholder: update sale notes until the fiscal columns are added
      await prisma.sale.update({
        where: { id: referenceId },
        data: {
          notes: `NFC-e: ${accessKey}`,
        },
      }).catch((err) => {
        console.error(`[Fiscal] Failed to update sale ${referenceId}:`, err);
      });

      break;
    }

    case "nfce.error": {
      console.error(
        `[Fiscal] NFC-e error for sale ${referenceId}:`,
        errors
      );
      // TODO: create a fiscal_events table to log errors for operator review
      break;
    }

    case "nfce.cancelled": {
      console.info(`[Fiscal] NFC-e cancelled for sale ${referenceId}`);
      break;
    }

    default: {
      console.warn("[Fiscal] Unknown webhook event:", event);
    }
  }

  // Always return 200 so the provider doesn't retry
  return NextResponse.json({ received: true });
}
