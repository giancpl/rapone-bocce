import { NextResponse } from "next/server";
import { getTournamentSummary, launchTournament } from "../../../lib/tournament-v2";
import { requireAdmin } from "../../../lib/auth";
import { apiErrorResponse } from "../../../lib/api-error";
export async function POST(request: Request) { try { const t = await getTournamentSummary(); if (!t) throw Error("Torneo non trovato"); await requireAdmin(t.id); const body = await request.json().catch(() => ({})); await launchTournament(t.id, body.mode === "REPECHAGE" ? "REPECHAGE" : "PRELIMINARIES"); return NextResponse.json({ ok: true }); } catch (e: any) { return apiErrorResponse(e); } }