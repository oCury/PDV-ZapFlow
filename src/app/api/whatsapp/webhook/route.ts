import { NextRequest, NextResponse } from "next/server";

/**
 * Webhook endpoint for Evolution API
 * Configure this URL in your Evolution API instance:
 * https://your-domain.com/api/whatsapp/webhook
 */

export async function POST(request: NextRequest) {
  try {
    const webhookToken = process.env.EVOLUTION_WEBHOOK_TOKEN;
    
    if (webhookToken) {
      const authHeader = request.headers.get("authorization");
      const token = authHeader?.replace("Bearer ", "");
      
      if (token !== webhookToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    const body = await request.json();

    console.log("[WhatsApp Webhook]", JSON.stringify(body, null, 2));

    const eventType = body.event;

    switch (eventType) {
      case "messages.upsert":
        await handleIncomingMessage(body.data);
        break;
      case "messages.update":
        await handleMessageUpdate(body.data);
        break;
      case "connection.update":
        await handleConnectionUpdate(body.data);
        break;
      default:
        console.log(`[WhatsApp Webhook] Unhandled event: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[WhatsApp Webhook Error]", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleIncomingMessage(data: Record<string, unknown>) {
  console.log("[WhatsApp] Incoming message:", data);
}

async function handleMessageUpdate(data: Record<string, unknown>) {
  console.log("[WhatsApp] Message update:", data);
}

async function handleConnectionUpdate(data: Record<string, unknown>) {
  console.log("[WhatsApp] Connection update:", data);
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "WhatsApp webhook endpoint active",
  });
}
