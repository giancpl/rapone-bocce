import { NextResponse } from "next/server";
import { addTournamentTeam, generateTestTeams, getTournamentSummary, regenerateDraw } from "../../../lib/tournament-v2";
import { prisma } from "../../../lib/db";
import { requireAdmin } from "../../../lib/auth";
import { MAX_NAME_LENGTH } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-error";

function text(value: unknown, label: string) {
  const result = String(value || "").trim().replace(/\s+/g, " ");
  if (!result) throw Error(`${label} obbligatorio`);
  if (result.length > MAX_NAME_LENGTH) throw Error(`${label} troppo lungo (max ${MAX_NAME_LENGTH})`);
  return result;
}
function response(error: any) { return apiErrorResponse(error, { duplicate: "Questa coppia è già iscritta" }); }
async function canChangeStructure(tournament: any) {
  if (tournament.status === "SETUP") return;
  const teamCount = await prisma.team.count({ where: { tournamentId: tournament.id } });
  if (tournament.status === "FINISHED" && teamCount >= 2) throw Error("Il torneo è concluso: puoi ancora correggere i nominativi");
  const played = await prisma.match.count({ where: { tournamentId: tournament.id, status: "FINISHED", teamAId: { not: null }, teamBId: { not: null } } });
  if (played) throw Error("Ci sono risultati registrati: puoi modificare i nomi e aggiungere solo negli slot sicuri, ma non rimuovere coppie");
}
function pair(body: any) { const playerOne = text(body.playerOne, "Primo giocatore"); const playerTwo = text(body.playerTwo, "Secondo giocatore"); return { playerOne, playerTwo, name: `${playerOne} / ${playerTwo}` }; }

export async function GET() {
  try {
    const tournament = await getTournamentSummary();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const payments = await prisma.team.findMany({ where: { tournamentId: tournament.id }, select: { id: true, paidAt: true } });
    return NextResponse.json(payments.map(team => ({ id: team.id, paid: Boolean(team.paidAt) })));
  } catch (error: any) { return response(error); }
}

export async function POST(request: Request) {
  try {
    const tournament = await getTournamentSummary();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const body = await request.json().catch(() => ({}));
    if (body.action === "generate-test") {
      const count = Number(body.count);
      const teams = await generateTestTeams(tournament.id, count);
      return NextResponse.json({ ok: true, count: teams.length, teams });
    }
    const result = await addTournamentTeam(tournament.id, pair(body));
    return NextResponse.json({ ok: true, placed: Boolean(result.placement), ...result });
  } catch (error: any) { return response(error); }
}

export async function PATCH(request: Request) {
  try {
    const tournament = await getTournamentSummary();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const body = await request.json().catch(() => ({}));
    const id = text(body.id, "Coppia");
    if (body.action === "payment") {
      const updated = await prisma.team.updateMany({ where: { id, tournamentId: tournament.id }, data: { paidAt: body.paid === true ? new Date() : null } });
      if (!updated.count) throw Error("Coppia non trovata");
      return NextResponse.json({ ok: true });
    }
    const values = pair(body);
    const updated = await prisma.team.updateMany({ where: { id, tournamentId: tournament.id }, data: values });
    if (!updated.count) throw Error("Coppia non trovata");
    return NextResponse.json({ ok: true, team: { id, ...values } });
  } catch (error: any) { return response(error); }
}

export async function DELETE(request: Request) {
  try {
    const tournament = await getTournamentSummary();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    await canChangeStructure(tournament);
    if (tournament.status !== "SETUP" && await prisma.team.count({ where: { tournamentId: tournament.id } }) <= 2) throw Error("Il tabellone richiede almeno due coppie");
    const id = text((await request.json().catch(() => ({}))).id, "Coppia");
    const deleted = await prisma.team.deleteMany({ where: { id, tournamentId: tournament.id } });
    if (!deleted.count) throw Error("Coppia non trovata");
    const regenerated = Boolean(await regenerateDraw(tournament.id));
    return NextResponse.json({ ok: true, regenerated, id });
  } catch (error: any) { return response(error); }
}
