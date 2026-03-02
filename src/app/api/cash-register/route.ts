import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { openShiftSchema } from "@/lib/validations/pos";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const openShift = await prisma.cashRegisterShift.findFirst({
      where: { user_id: session.userId, status: "OPEN" },
      orderBy: { opened_at: "desc" },
    });

    return NextResponse.json({
      hasOpenShift: !!openShift,
      shift: openShift
        ? {
            id: openShift.id,
            openedAt: openShift.opened_at,
            openingCash: Number(openShift.opening_cash),
            withdrawals: Number(openShift.withdrawals),
          }
        : null,
    });
  } catch {
    return NextResponse.json(
      { error: "Error fetching cash register status" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = body.action;

    if (action === "OPEN") {
      const parsed = openShiftSchema.safeParse({ openingCash: body.openingCash ?? 0 });
      if (!parsed.success) {
        return NextResponse.json(
          { error: parsed.error.issues[0]?.message || "Invalid opening cash" },
          { status: 400 }
        );
      }

      const existing = await prisma.cashRegisterShift.findFirst({
        where: { user_id: session.userId, status: "OPEN" },
      });
      if (existing) {
        return NextResponse.json(
          { error: "Já existe um turno aberto" },
          { status: 400 }
        );
      }

      const shift = await prisma.cashRegisterShift.create({
        data: {
          user_id: session.userId,
          opening_cash: parsed.data.openingCash,
          status: "OPEN",
        },
      });

      return NextResponse.json({
        id: shift.id,
        openedAt: shift.opened_at,
        openingCash: Number(shift.opening_cash),
      });
    }

    if (action === "CLOSE") {
      const shiftId = body.shiftId;
      const closingCash = parseFloat(body.closingCash);

      if (!shiftId || isNaN(closingCash)) {
        return NextResponse.json(
          { error: "shiftId and closingCash required" },
          { status: 400 }
        );
      }

      const shift = await prisma.cashRegisterShift.findFirst({
        where: { id: shiftId, user_id: session.userId, status: "OPEN" },
      });

      if (!shift) {
        return NextResponse.json(
          { error: "Turno não encontrado ou já fechado" },
          { status: 404 }
        );
      }

      await prisma.cashRegisterShift.update({
        where: { id: shiftId },
        data: {
          status: "CLOSED",
          closed_at: new Date(),
          closing_cash: closingCash,
        },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "WITHDRAWAL") {
      const shiftId = body.shiftId;
      const amount = parseFloat(body.amount);

      if (!shiftId || isNaN(amount) || amount <= 0) {
        return NextResponse.json(
          { error: "shiftId and amount (positive) required" },
          { status: 400 }
        );
      }

      const shift = await prisma.cashRegisterShift.findFirst({
        where: { id: shiftId, user_id: session.userId, status: "OPEN" },
      });

      if (!shift) {
        return NextResponse.json(
          { error: "Turno não encontrado" },
          { status: 404 }
        );
      }

      await prisma.cashRegisterShift.update({
        where: { id: shiftId },
        data: {
          withdrawals: { increment: amount },
        },
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Error processing cash register action" },
      { status: 500 }
    );
  }
}
