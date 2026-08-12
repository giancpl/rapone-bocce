import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { login } from "../../../lib/auth";
import { hashPassword } from "../../../lib/security";
const NAME = "Torneo di Bocce", EDITION = "51° edizione";
export async function POST(request: Request) { try { const body = await request.json(); if (typeof body.password !== "string" || body.password.length < 10) throw Error("Password troppo corta (minimo 10 caratteri)"); const existing = await prisma.tournament.findFirst(); if (existing) throw Error("Torneo già creato"); const tournament = await prisma.tournament.create({ data: { name: NAME, edition: EDITION, adminPasswordHash: await hashPassword(body.password) } }); await login(tournament.id, body.password); return NextResponse.json({ ok: true, id: tournament.id }); } catch (error: any) { const message = error?.message || "Impossibile creare il torneo"; return NextResponse.json({ error: message }, { status: message === "Torneo già creato" ? 409 : 400 }); } }
