import { NextResponse } from "next/server";
import { getTournament, publicTournament } from "../../../lib/tournament-v2";

function databaseError(error: any) {
  const message = String(error?.message || "");
  if (message.includes("DATABASE_URL mancante")) return "Variabile database assente";
  if (error?.code === "P1013") return "URL database non valida";
  if (error?.code === "P1001" || message.includes("Can.t reach database server")) return "Database non raggiungibile";
  if (error?.code === "P2021" || message.includes("does not exist")) return "Migrazioni database mancanti";
  return "Errore database";
}

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return NextResponse.json(publicTournament(await getTournament()));
  } catch (error) {
    console.error("Unable to load tournament state", error);
    return NextResponse.json({ error: databaseError(error) }, { status: 503 });
  }
}
