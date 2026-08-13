import { NextResponse } from "next/server";
import { addTournamentTeam, generateTestTeams, getTournamentSummary, removeTournamentTeam } from "../../../lib/tournament-v2";
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
    const id = text((await request.json().catch(() => ({}))).id, "Coppia");
    const result = await removeTournamentTeam(tournament.id, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) { return response(error); }
}
