import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db";
import { login } from "../../../lib/auth";
import { hashPassword } from "../../../lib/security";
import { apiErrorResponse } from "../../../lib/api-error";
const NAME = "Torneo di Bocce", EDITION = "51° edizione";
export async function POST(request: Request) { try { const body = await request.json(); if (typeof body.password !== "string" || body.password.length < 10) throw Error("Password troppo corta (minimo 10 caratteri)"); const existing = await prisma.tournament.findFirst(); if (existing) throw Error("Torneo già creato"); const tournament = await prisma.tournament.create({ data: { name: NAME, edition: EDITION, adminPasswordHash: await hashPassword(body.password) } }); await login(tournament.id, body.password); return NextResponse.json({ ok: true, id: tournament.id }); } catch (error: any) { if (error?.message === "Torneo già creato") return NextResponse.json({ error: error.message }, { status: 409 }); return apiErrorResponse(error, { fallback: "Impossibile creare il torneo" }); } }
