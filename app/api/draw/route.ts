import { NextResponse } from "next/server";
import { confirmAutomaticRepechage, generateDraw, getTournamentSummary, resetTournament } from "../../../lib/tournament-v2";
import { confirmAdminPassword, requireAdmin } from "../../../lib/auth";

function mode(value: unknown) { return value === "REPECHAGE" ? "REPECHAGE" : "PRELIMINARIES" as const; }
function failure(error: any) { const message = error?.message || "Errore"; return NextResponse.json({ error: message }, { status: message === "NON_AUTORIZZATO" ? 401 : 400 }); }

export async function POST(request: Request) {
  try {
    const tournament = await getTournamentSummary();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const body = await request.json().catch(() => ({}));
    await generateDraw(tournament.id, mode(body.mode));
    return NextResponse.json({ ok: true });
  } catch (error: any) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    const tournament = await getTournamentSummary();
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    const body = await request.json().catch(() => ({}));
    if (body.action === "repechage") await confirmAutomaticRepechage(tournament.id);
    else if (body.action === "reset") {
      if (body.confirmation !== "RESETTA TORNEO") throw Error("Conferma reset non valida");
      if (!(await confirmAdminPassword(tournament.id, body.password))) throw Error("Password non valida");
      await resetTournament(tournament.id);
    }
    else throw Error("Azione non valida");
    return NextResponse.json({ ok: true });
  } catch (error: any) { return failure(error); }
}
