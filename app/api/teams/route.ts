import { NextResponse } from "next/server";
import { getTournament } from "../../../lib/tournament-v2";
import { prisma } from "../../../lib/db";
import { requireAdmin } from "../../../lib/auth";
import { MAX_NAME_LENGTH } from "../../../lib/security";

function text(value: unknown, label: string) {
  const result = String(value || "").trim().replace(/\s+/g, " ");
  if (!result) throw Error(`${label} obbligatorio`);
  if (result.length > MAX_NAME_LENGTH) throw Error(`${label} troppo lungo (max ${MAX_NAME_LENGTH})`);
  return result;
}
function response(error: any) { const message = error?.message || "Errore"; return NextResponse.json({ error: message }, { status: message === "NON_AUTORIZZATO" ? 401 : 400 }); }
function pair(body: any) { const playerOne = text(body.playerOne, "Primo giocatore"); const playerTwo = text(body.playerTwo, "Secondo giocatore"); return { playerOne, playerTwo, name: `${playerOne} / ${playerTwo}` }; }

export async function POST(request: Request) {
  try {
    const tournament = await getTournament();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const values = pair(await request.json().catch(() => ({})));
    await prisma.team.create({ data: { tournamentId: tournament.id, ...values } });
    return NextResponse.json({ ok: true });
  } catch (error: any) { return response(error); }
}

export async function PATCH(request: Request) {
  try {
    const tournament = await getTournament();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const body = await request.json().catch(() => ({}));
    const id = text(body.id, "Coppia");
    const values = pair(body);
    const updated = await prisma.team.updateMany({ where: { id, tournamentId: tournament.id }, data: values });
    if (!updated.count) throw Error("Coppia non trovata");
    return NextResponse.json({ ok: true });
  } catch (error: any) { return response(error); }
}

export async function DELETE(request: Request) {
  try {
    const tournament = await getTournament();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const id = text((await request.json().catch(() => ({}))).id, "Coppia");
    const deleted = await prisma.team.deleteMany({ where: { id, tournamentId: tournament.id } });
    if (!deleted.count) throw Error("Coppia non trovata");
    return NextResponse.json({ ok: true });
  } catch (error: any) { return response(error); }
}
