import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { requireAdmin } from "../../../lib/auth";
import { MAX_TEAMS } from "../../../lib/bracket";
import { MAX_NAME_LENGTH } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-error";

function text(value: unknown, label: string) {
  const result = String(value || "").trim().replace(/\s+/g, " ");
  if (!result) throw Error(label + " obbligatorio");
  if (result.length > MAX_NAME_LENGTH) throw Error(label + " troppo lungo");
  return result;
}

function errorResponse(error: any) {
  return apiErrorResponse(error);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const playerOne = text(body.playerOne, "Primo giocatore");
    const playerTwo = text(body.playerTwo, "Secondo giocatore");
    await prisma.$transaction(async tx => {
      const tournament = await tx.tournament.findFirst({
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true }
      });
      if (!tournament || tournament.status !== "SETUP") throw Error("Le iscrizioni non sono disponibili");
      await tx.registration.create({ data: { tournamentId: tournament.id, playerOne, playerTwo } });
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return errorResponse(error);
  }
}

export async function GET() {
  try {
    const tournament = await prisma.tournament.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true }
    });
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const registrations = await prisma.registration.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { createdAt: "asc" }
    });
    return NextResponse.json(registrations, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const tournament = await prisma.tournament.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);

    const registrationId = String(body.id || "");
    const action = String(body.action || "");
    if (!["approve", "reject"].includes(action)) throw Error("Azione non valida");

    const team = await prisma.$transaction(async tx => {
      const current = await tx.tournament.findUnique({
        where: { id: tournament.id },
        select: { status: true }
      });
      if (!current || current.status !== "SETUP") throw Error("Le iscrizioni sono chiuse");

      const registration = await tx.registration.findFirst({
        where: { id: registrationId, tournamentId: tournament.id, status: "PENDING" }
      });
      if (!registration) throw Error("Richiesta non disponibile");

      if (action === "reject") {
        await tx.registration.update({
          where: { id: registration.id },
          data: { status: "REJECTED", reviewedAt: new Date() }
        });
        return null;
      }

      const teamCount = await tx.team.count({ where: { tournamentId: tournament.id } });
      if (teamCount >= MAX_TEAMS) throw Error("Limite massimo di " + MAX_TEAMS + " coppie raggiunto");

      const created = await tx.team.create({
        data: {
          tournamentId: tournament.id,
          playerOne: registration.playerOne,
          playerTwo: registration.playerTwo,
          name: registration.playerOne + " / " + registration.playerTwo
        },
        select: { id: true, name: true, playerOne: true, playerTwo: true }
      });
      await tx.registration.update({
        where: { id: registration.id },
        data: { status: "APPROVED", reviewedAt: new Date() }
      });
      return created;
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({ ok: true, team });
  } catch (error: any) {
    return errorResponse(error);
  }
}
