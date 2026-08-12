import { NextResponse } from "next/server";
import { assignRepechage, finalizeRepechage, generateDraw, getTournament, resetTournament, unassignRepechage } from "../../../lib/tournament-v2";
import { requireAdmin } from "../../../lib/auth";

function mode(value: unknown) { return value === "REPECHAGE" ? "REPECHAGE" : "PRELIMINARIES" as const; }
function failure(error: any) { const message = error?.message || "Errore"; return NextResponse.json({ error: message }, { status: message === "NON_AUTORIZZATO" ? 401 : 400 }); }

export async function POST(request: Request) {
  try {
    const tournament = await getTournament();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const body = await request.json().catch(() => ({}));
    await generateDraw(tournament.id, mode(body.mode));
    return NextResponse.json({ ok: true });
  } catch (error: any) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const tournament = await getTournament();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const body = await request.json().catch(() => ({}));
    if (body.action === "assign") await assignRepechage(tournament.id, String(body.teamId || ""), String(body.matchId || ""));
    else if (body.action === "unassign") await unassignRepechage(tournament.id, String(body.matchId || ""));
    else if (body.action === "finalize") await finalizeRepechage(tournament.id);
    else if (body.action === "reset") await resetTournament(tournament.id);
    else throw Error("Azione di ripescaggio non valida");
    return NextResponse.json({ ok: true });
  } catch (error: any) { return failure(error); }
}
