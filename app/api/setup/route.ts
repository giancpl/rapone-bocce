import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { login } from "../../../lib/auth";
import { hashPassword } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-error";
import { TOURNAMENT_NAME } from "../../../lib/editions";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.password !== "string" || body.password.length < 10) throw Error("Password troppo corta (minimo 10 caratteri)");
    if (await prisma.tournament.findFirst()) throw Error("Torneo già creato");
    const adminPasswordHash = await hashPassword(body.password);
    const tournament = await prisma.$transaction(async tx => {
      await tx.organizer.create({ data: { id: "main", adminPasswordHash } });
      return tx.tournament.create({ data: {
        name: TOURNAMENT_NAME,
        edition: "51° edizione",
        editionNumber: 51,
        scheduledAt: new Date("2026-08-13T14:00:00.000Z"),
        isCurrent: true,
        adminPasswordHash,
      } });
    });
    await login(body.password);
    return NextResponse.json({ ok: true, id: tournament.id });
  } catch (error: any) {
    if (error?.message === "Torneo già creato") return NextResponse.json({ error: error.message }, { status: 409 });
    return apiErrorResponse(error, { fallback: "Impossibile creare il torneo" });
  }
}
