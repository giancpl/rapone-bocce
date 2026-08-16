import { cookies } from "next/headers";
import { prisma } from "./db";
import { hashToken, newToken, SESSION_COOKIE, sessionExpiry, verifyPassword } from "./security";

const ORGANIZER_ID = "main";
function passwordArgument(first: string, second?: string) { return second === undefined ? first : second; }

export async function login(first: string, second?: string) {
  const password = passwordArgument(first, second);
  const organizer = await prisma.organizer.findUnique({ where: { id: ORGANIZER_ID } });
  if (!organizer || !(await verifyPassword(password, organizer.adminPasswordHash))) return false;
  const current = await prisma.tournament.findFirst({ where: { isCurrent: true }, select: { id: true } });
  if (!current) return false;
  const raw = newToken(), expires = sessionExpiry();
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  await prisma.adminSession.create({ data: { tournamentId: current.id, organizerId: organizer.id, tokenHash: hashToken(raw), expiresAt: expires } });
  (await cookies()).set(SESSION_COOKIE, raw, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires });
  return true;
}

export async function requireAdmin(_legacyTournamentId?: string) {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!raw) throw new Error("NON_AUTORIZZATO");
  const session = await prisma.adminSession.findUnique({ where: { tokenHash: hashToken(raw) } });
  if (!session || session.organizerId !== ORGANIZER_ID || session.expiresAt <= new Date()) throw new Error("NON_AUTORIZZATO");
  return session;
}

export async function confirmAdminPassword(first: string, second?: string) {
  const password = passwordArgument(first, second);
  const organizer = await prisma.organizer.findUnique({ where: { id: ORGANIZER_ID }, select: { adminPasswordHash: true } });
  return Boolean(organizer && typeof password === "string" && await verifyPassword(password, organizer.adminPasswordHash));
}

export async function logout() {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (raw) await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(raw) } });
  (await cookies()).delete(SESSION_COOKIE);
}
