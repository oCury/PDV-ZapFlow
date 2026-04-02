import { NextRequest, NextResponse } from "next/server";
import { processFollowups, getFollowupStats } from "@/lib/followup/followup-service";

/**
 * Vercel Cron Job - Customer Follow-up
 * 
 * Runs daily at 8 AM to send WhatsApp messages to customers
 * who made purchases 15 days ago, offering 10% cashback.
 * 
 * Schedule: "0 8 * * *" (configured in vercel.json)
 * 
 * Security: Protected by CRON_SECRET header verification
 * 
 * Query params:
 * - daysAgo: number (default 15) - Override the days to look back
 * - dryRun: boolean (default false) - Log without sending/saving
 * - test: boolean - Skip auth for local testing
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const isTest = searchParams.get("test") === "true";
    const dryRun = searchParams.get("dryRun") === "true";
    const daysAgo = parseInt(searchParams.get("daysAgo") || "15", 10);

    // Verify cron secret (Vercel sets this automatically)
    // Skip verification in test mode for local development
    if (!isTest) {
      const authHeader = request.headers.get("authorization");
      const cronSecret = process.env.CRON_SECRET;

      if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
        console.log("[Cron Followup] Unauthorized access attempt");
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    console.log(`[Cron Followup] Starting... (daysAgo: ${daysAgo}, dryRun: ${dryRun})`);

    const result = await processFollowups(daysAgo, dryRun);

    console.log(`[Cron Followup] Completed:`, {
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      totalCashback: result.totalCashbackGiven.toFixed(2),
    });

    return NextResponse.json({
      success: true,
      summary: {
        processed: result.processed,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        totalCashbackGiven: result.totalCashbackGiven,
      },
      results: dryRun || isTest ? result.results : undefined,
    });
  } catch (error) {
    console.error("[Cron Followup] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for manual triggering from admin panel
 */
export async function POST(request: NextRequest) {
  try {
    // This endpoint should be protected by session auth
    // For now, we'll allow it for admin panel usage
    
    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const daysAgo = parseInt(body.daysAgo || "15", 10);

    console.log(`[Manual Followup] Starting... (daysAgo: ${daysAgo}, dryRun: ${dryRun})`);

    const result = await processFollowups(daysAgo, dryRun);

    return NextResponse.json({
      success: true,
      summary: {
        processed: result.processed,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        totalCashbackGiven: result.totalCashbackGiven,
      },
      results: result.results,
    });
  } catch (error) {
    console.error("[Manual Followup] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
