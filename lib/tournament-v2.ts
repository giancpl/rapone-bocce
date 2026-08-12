import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./db";

const FIELDS = 2;
export const PUBLIC_INCLUDE = {
  matches: { orderBy: [{ round: "asc" as const }, { position: "asc" as const }], include: { teamA: true, teamB: true, winner: true } },
  teams: { orderBy: { name: "asc" as const } },
};

const nextPowerOfTwo = (value: number) => 2 ** Math.ceil(Math.log2(value));
const displayName = (team: { name: string; playerOne?: string | null; playerTwo?: string | null }) => team.playerOne && team.playerTwo ? `${team.playerOne} / ${team.playerTwo}` : team.name;

export async function getTournament() {
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, include: PUBLIC_INCLUDE });
  if (tournament?.status === "LIVE" && tournament.matches.length > 0 && tournament.matches.every(match => match.status === "FINISHED")) {
    return prisma.tournament.update({ where: { id: tournament.id }, data: { status: "FINISHED", finishedAt: tournament.finishedAt ?? new Date() }, include: PUBLIC_INCLUDE });
  }
  return tournament;
}

function repechage(tournament: any) {
  if (tournament.drawMode !== "REPECHAGE") return null;
  const candidates = tournament.matches.filter((match: any) => match.round === 1 && match.status === "FINISHED" && match.teamA && match.teamB && match.winnerId).map((match: any) => {
    const loser = match.winnerId === match.teamAId ? match.teamB : match.teamA;
    const scored = match.winnerId === match.teamAId ? match.scoreB : match.scoreA;
    const conceded = match.winnerId === match.teamAId ? match.scoreA : match.scoreB;
    return { id: loser.id, name: displayName(loser), difference: scored - conceded, scored, conceded };
  }).sort((a: any, b: any) => b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name));
  const used = new Set(tournament.matches.filter((match: any) => match.status !== "FINISHED").flatMap((match: any) => [match.teamAId, match.teamBId]));
  const slots = tournament.matches.filter((match: any) => match.round === 1 && match.status === "SCHEDULED" && Boolean(match.teamAId) !== Boolean(match.teamBId)).map((match: any) => ({ id: match.id, opponent: displayName(match.teamA ?? match.teamB) }));
  return { candidates: candidates.filter((team: any) => !used.has(team.id)), slots };
}

export function publicTournament(tournament: any) {
  if (!tournament) return null;
  return {
    id: tournament.id, name: tournament.name, edition: tournament.edition, status: tournament.status, drawMode: tournament.drawMode,
    teams: tournament.teams.length, teamList: tournament.teams.map((team: any) => ({ id: team.id, name: displayName(team), playerOne: team.playerOne, playerTwo: team.playerTwo })),
    repechage: repechage(tournament), updatedAt: tournament.updatedAt,
    matches: tournament.matches.map((match: any) => ({ id: match.id, round: match.round, position: match.position, field: match.field, a: match.teamA ? displayName(match.teamA) : null, b: match.teamB ? displayName(match.teamB) : null, scoreA: match.scoreA, scoreB: match.scoreB, status: match.status, winner: match.winner ? displayName(match.winner) : null })),
  };
}

function shuffle<T>(items: T[]) { const copy = [...items]; for (let index = copy.length - 1; index > 0; index--) { const other = Math.floor(Math.random() * (index + 1)); [copy[index], copy[other]] = [copy[other], copy[index]]; } return copy; }

async function advance(tx: any, tournamentId: string, round: number, position: number, winnerId: string) {
  const next = await tx.match.findUnique({ where: { tournamentId_round_position: { tournamentId, round: round + 1, position: Math.floor(position / 2) } } });
  if (!next) return false;
  await tx.match.update({ where: { id: next.id }, data: { [position % 2 === 0 ? "teamAId" : "teamBId"]: winnerId } });
  return true;
}

async function advanceByes(tx: any, tournamentId: string) {
  let changed = true;
  while (changed) {
    changed = false;
    const matches = await tx.match.findMany({ where: { tournamentId, status: "SCHEDULED" }, orderBy: [{ round: "asc" }, { position: "asc" }] });
    for (const match of matches) {
      const winnerId = match.teamAId ?? match.teamBId;
      if (!winnerId || (match.teamAId && match.teamBId)) continue;
      if (match.round > 1) {
        const unresolved = await tx.match.count({ where: { tournamentId, round: match.round - 1, position: { in: [match.position * 2, match.position * 2 + 1] }, status: { not: "FINISHED" } } });
        if (unresolved) continue;
      }
      await tx.match.update({ where: { id: match.id }, data: { status: "FINISHED", winnerId, finishedAt: new Date() } });
      await advance(tx, tournamentId, match.round, match.position, winnerId);
      changed = true;
    }
  }
}

async function schedule(tx: any, tournamentId: string) {
  const live = await tx.match.count({ where: { tournamentId, status: "LIVE" } });
  const open = await tx.match.findMany({ where: { tournamentId, status: "SCHEDULED", teamAId: { not: null }, teamBId: { not: null } }, orderBy: [{ round: "asc" }, { position: "asc" }], take: Math.max(0, FIELDS - live) });
  for (const [index, match] of open.entries()) await tx.match.update({ where: { id: match.id }, data: { status: "LIVE", field: live + index + 1, startedAt: new Date() } });
}

export async function generateDraw(tournamentId: string, drawMode: "PRELIMINARIES" | "REPECHAGE" = "PRELIMINARIES") {
  const teams = await prisma.team.findMany({ where: { tournamentId } });
  if (teams.length < 2) throw Error("Servono almeno 2 coppie");
  const size = nextPowerOfTwo(teams.length);
  const slots = [...shuffle(teams), ...Array(size - teams.length).fill(null)];
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw Error("Torneo non trovato");
    await tx.match.deleteMany({ where: { tournamentId } });
    for (let round = 1; round <= Math.log2(size); round++) for (let position = 0; position < size / 2 ** round; position++) await tx.match.create({ data: { tournamentId, round, position, teamAId: round === 1 ? slots[position * 2]?.id ?? null : null, teamBId: round === 1 ? slots[position * 2 + 1]?.id ?? null : null } });
    if (drawMode === "PRELIMINARIES") await advanceByes(tx, tournamentId);
    return tx.tournament.update({ where: { id: tournamentId }, data: { status: "READY", drawMode, startedAt: null, finishedAt: null }, include: PUBLIC_INCLUDE });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function startTournament(tournamentId: string) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament || tournament.status !== "READY") throw Error("Il torneo non è pronto");
    await schedule(tx, tournamentId);
    return tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE", startedAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

function validScore(a: number, b: number) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 14 || b > 14 || a === b || Math.max(a, b) < 11) throw Error("Il vincitore deve avere da 11 a 14 punti; pareggi non ammessi");
}

export async function submitResult(tournamentId: string, matchId: string, scoreA: number, scoreB: number) {
  validScore(scoreA, scoreB);
  return prisma.$transaction(async tx => {
    const match = await tx.match.findFirst({ where: { id: matchId, tournamentId } });
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!match || !tournament) throw Error("Partita non trovata");
    if (match.status !== "LIVE") throw Error("La partita non è in corso");
    const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
    if (!winnerId) throw Error("Coppia vincente non valida");
    const result = await tx.match.update({ where: { id: match.id }, data: { scoreA, scoreB, winnerId, status: "FINISHED", field: null, finishedAt: new Date() } });
    await advance(tx, tournamentId, match.round, match.position, winnerId);
    if (tournament.drawMode === "PRELIMINARIES") await advanceByes(tx, tournamentId);
    await schedule(tx, tournamentId);
    const unfinished = await tx.match.count({ where: { tournamentId, status: { not: "FINISHED" } } });
    await tx.tournament.update({ where: { id: tournamentId }, data: unfinished ? {} : { status: "FINISHED", finishedAt: new Date() } });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function assignRepechage(tournamentId: string, teamId: string, matchId: string) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament || tournament.drawMode !== "REPECHAGE" || tournament.status !== "LIVE") throw Error("Ripescaggi non disponibili");
    const source = await tx.match.findFirst({ where: { tournamentId, round: 1, status: "FINISHED", winnerId: { not: null }, OR: [{ teamAId: teamId }, { teamBId: teamId }] } });
    if (!source || source.winnerId === teamId) throw Error("La coppia non è ripescabile");
    const target = await tx.match.findFirst({ where: { id: matchId, tournamentId, round: 1, status: "SCHEDULED" } });
    if (!target || Boolean(target.teamAId) === Boolean(target.teamBId)) throw Error("Posto di ripescaggio non disponibile");
    const occupied = await tx.match.count({ where: { tournamentId, status: { not: "FINISHED" }, OR: [{ teamAId: teamId }, { teamBId: teamId }] } });
    if (occupied) throw Error("La coppia è già nel tabellone");
    await tx.match.update({ where: { id: target.id }, data: target.teamAId ? { teamBId: teamId } : { teamAId: teamId } });
    await schedule(tx, tournamentId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resetTournament(tournamentId: string) { return prisma.$transaction(async tx => { await tx.match.deleteMany({ where: { tournamentId } }); return tx.tournament.update({ where: { id: tournamentId }, data: { status: "SETUP", startedAt: null, finishedAt: null } }); }); }

export async function finalizeRepechage(tournamentId: string) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament || tournament.drawMode !== "REPECHAGE" || tournament.status !== "LIVE") throw Error("Ripescaggi non disponibili");
    await advanceByes(tx, tournamentId);
    await schedule(tx, tournamentId);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

type CascadeMatch = { id: string; round: number; position: number; teamAId: string | null; teamBId: string | null; status: string };
function cascadeFrom(matches: CascadeMatch[], match: CascadeMatch) { const cascade: CascadeMatch[] = []; let current = match; while (true) { const next = matches.find(item => item.round === current.round + 1 && item.position === Math.floor(current.position / 2)); if (!next) return cascade; cascade.push(next); current = next; } }
export async function previewCorrection(tournamentId: string, matchId: string, scoreA: number, scoreB: number) { validScore(scoreA, scoreB); const matches = await prisma.match.findMany({ where: { tournamentId }, orderBy: [{ round: "asc" }, { position: "asc" }] }); const match = matches.find(item => item.id === matchId); if (!match || match.status !== "FINISHED" || !match.teamAId || !match.teamBId) throw Error("Risultato non modificabile"); const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId; const cascade = winnerId !== match.winnerId ? cascadeFrom(matches, match) : []; return { changesWinner: winnerId !== match.winnerId, affected: cascade.map(item => ({ id: item.id, round: item.round, position: item.position, status: item.status })) }; }
export async function correctResult(tournamentId: string, matchId: string, scoreA: number, scoreB: number, confirmCascade = false) { const preview = await previewCorrection(tournamentId, matchId, scoreA, scoreB); if (preview.affected.length && !confirmCascade) throw Error("Conferma necessaria per riaprire gli incontri successivi"); return prisma.$transaction(async tx => { const matches = await tx.match.findMany({ where: { tournamentId }, orderBy: [{ round: "asc" }, { position: "asc" }] }); const match = matches.find(item => item.id === matchId); if (!match || match.status !== "FINISHED" || !match.teamAId || !match.teamBId) throw Error("Risultato non modificabile"); const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId; const cascade = winnerId !== match.winnerId ? cascadeFrom(matches, match) : []; await tx.match.update({ where: { id: match.id }, data: { scoreA, scoreB, winnerId } }); if (cascade.length) { for (const item of cascade) await tx.match.update({ where: { id: item.id }, data: { status: "SCHEDULED", field: null, scoreA: 0, scoreB: 0, winnerId: null, startedAt: null, finishedAt: null } }); for (const [index, item] of cascade.entries()) { const previous = index === 0 ? match : cascade[index - 1]; const slot = previous.position % 2 === 0 ? "teamAId" : "teamBId"; await tx.match.update({ where: { id: item.id }, data: { [slot]: index === 0 ? winnerId : null } }); } await schedule(tx, tournamentId); } await tx.tournament.update({ where: { id: tournamentId }, data: { status: cascade.length ? "LIVE" : undefined, finishedAt: cascade.length ? null : undefined } }); return { affected: cascade.map(item => item.id) }; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
