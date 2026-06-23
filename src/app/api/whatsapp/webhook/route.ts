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
        // unhandled event type — no action needed
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

async function handleIncomingMessage(_data: Record<string, unknown>) {
  // placeholder for incoming message handling
}

async function handleMessageUpdate(_data: Record<string, unknown>) {
  // placeholder for message update handling
}

async function handleConnectionUpdate(_data: Record<string, unknown>) {
  // placeholder for connection update handling
}

export async function GET() {
  return NextResponse.json({
    status: "ok",
    message: "WhatsApp webhook endpoint active",
  });
}
