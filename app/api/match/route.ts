import { NextResponse } from "next/server";
import { correctResult, getTournament, previewCorrection, submitResult } from "../../../lib/tournament-v2";
import { requireAdmin } from "../../../lib/auth";
async function body(request: Request) { try { return await request.json(); } catch { throw Error("Richiesta non valida"); } }
async function run(request: Request, correct = false) { try { const tournament = await getTournament(); if (!tournament) throw Error("Torneo non trovato"); await requireAdmin(tournament.id); const value = await body(request); const id = String(value.id || ""); if (!id) throw Error("Partita obbligatoria"); const a = Number(value.a), b = Number(value.b); if (correct && value.preview) return NextResponse.json({ preview: await previewCorrection(tournament.id, id, a, b) }); const result = correct ? await correctResult(tournament.id, id, a, b, value.confirmCascade === true) : await submitResult(tournament.id, id, a, b); return NextResponse.json({ ok: true, result }); } catch (error: any) { return NextResponse.json({ error: error.message || "Errore" }, { status: error.message === "NON_AUTORIZZATO" ? 401 : 400 }); } }
export async function POST(request: Request) { return run(request); }
export async function PATCH(request: Request) { return run(request, true); }
