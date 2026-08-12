import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { login, requireAdmin } from "../../../lib/auth";
import { hashPassword, MAX_NAME_LENGTH } from "../../../lib/security";

function clean(value: unknown, fallback: string) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ") || fallback;
  if (!text) throw Error("Il nome del torneo è obbligatorio");
  if (text.length > MAX_NAME_LENGTH) throw Error(`Testo troppo lungo (max ${MAX_NAME_LENGTH})`);
  return text;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (typeof body.password !== "string" || body.password.length < 10) throw Error("Password troppo corta (minimo 10 caratteri)");
    const existing = await prisma.tournament.findFirst();
    if (existing) throw Error("Torneo già creato");
    const tournament = await prisma.tournament.create({
      data: {
        name: clean(body.name, "Rapone Bocce"),
        edition: clean(body.edition, "51ª Edizione"),
        adminPasswordHash: await hashPassword(body.password),
      },
    });
    await login(tournament.id, body.password);
    return NextResponse.json({ ok: true, id: tournament.id });
  } catch (error: any) {
    const message = error?.message || "Impossibile creare il torneo";
    return NextResponse.json({ error: message }, { status: message === "Torneo già creato" ? 409 : 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" } });
    if (!tournament) throw Error("Torneo non trovato");
    await requireAdmin(tournament.id);
    if (tournament.status !== "SETUP") throw Error("Le impostazioni sono bloccate dopo il sorteggio");
    const body = await request.json();
    await prisma.tournament.update({ where: { id: tournament.id }, data: { name: clean(body.name, tournament.name), edition: clean(body.edition, tournament.edition) } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const message = error?.message || "Impossibile aggiornare il torneo";
    return NextResponse.json({ error: message }, { status: message === "NON_AUTORIZZATO" ? 401 : 400 });
  }
}
