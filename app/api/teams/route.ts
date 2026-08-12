import { NextResponse } from "next/server";
import { getTournament } from "../../../lib/tournament-v2";
import { prisma } from "../../../lib/db";
import { requireAdmin } from "../../../lib/auth";
import { MAX_NAME_LENGTH } from "../../../lib/security";

function errorResponse(error: any) {
  const message = error?.message || "Errore";
  return NextResponse.json({ error: message }, { status: message === "NON_AUTORIZZATO" ? 401 : 400 });
}

export async function POST(request: Request) {
  try {
    const tournament = await getTournament();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    if (tournament.status !== "SETUP") throw Error("Le coppie sono bloccate");
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim().replace(/\s+/g, " ");
    if (!name) throw Error("Nome obbligatorio");
    if (name.length > MAX_NAME_LENGTH) throw Error(`Nome troppo lungo (max ${MAX_NAME_LENGTH})`);
    await prisma.team.create({ data: { tournamentId: tournament.id, name } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const tournament = await getTournament();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    if (tournament.status !== "SETUP") throw Error("Le coppie sono bloccate");
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "");
    if (!id) throw Error("Coppia obbligatoria");
    const result = await prisma.team.deleteMany({ where: { id, tournamentId: tournament.id } });
    if (!result.count) throw Error("Coppia non trovata");
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return errorResponse(error);
  }
}
