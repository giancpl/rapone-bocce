import { NextResponse } from "next/server";
import { requireAdmin } from "../../../../lib/auth";
import { getTournamentSummary } from "../../../../lib/tournament-v2";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const tournament = await getTournamentSummary();
    if (!tournament) return NextResponse.json({ authenticated: false });
    await requireAdmin(tournament.id);
    return NextResponse.json({ authenticated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json({ authenticated: false }, { status: error?.message === "NON_AUTORIZZATO" ? 401 : 503, headers: { "Cache-Control": "no-store" } });
  }
}
