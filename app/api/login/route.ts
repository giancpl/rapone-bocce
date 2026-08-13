import { NextResponse } from "next/server";
import { getTournament } from "../../../lib/tournament-v2";
import { login } from "../../../lib/auth";
import { apiErrorResponse } from "../../../lib/api-error";

export async function POST(request: Request) {
  try {
    const tournament = await getTournament();
    if (!tournament) return NextResponse.json({ error: "Torneo non creato" }, { status: 404 });
    const body = await request.json().catch(() => ({}));
    if (typeof body.password !== "string") throw Error("Password obbligatoria");
    if (!(await login(tournament.id, body.password))) throw Error("Password non valida");
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (String(error?.message || "").startsWith("Password")) return NextResponse.json({ error: error.message }, { status: 401 });
    return apiErrorResponse(error, { fallback: "Accesso non riuscito" });
  }
}
