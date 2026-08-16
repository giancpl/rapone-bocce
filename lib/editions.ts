import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./db";
import { assertBocceScore, repechageCutoff, repechagePlan } from "./bracket";
import { PUBLIC_INCLUDE, publicTournament } from "./tournament-v2";

const TX = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 } as const;
export const TOURNAMENT_NAME = "Torneo di Bocce";
const displayName = (team: any) => team.playerOne && team.playerTwo ? `${team.playerOne} / ${team.playerTwo}` : team.name;

export async function listAdminEditions() {
  const editions = await prisma.tournament.findMany({ orderBy: { editionNumber: "desc" }, select: { id: true, editionNumber: true, edition: true, scheduledAt: true, status: true, isCurrent: true, archivedAt: true } });
  return { currentId: editions.find(item => item.isCurrent)?.id ?? null, editions };
}

export async function getAdminEdition(id: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id }, include: PUBLIC_INCLUDE });
  if (!tournament) return null;
  return { ...publicTournament(tournament), historical: !tournament.isCurrent };
}

export async function createNextEdition(scheduledAt: Date) {
  if (Number.isNaN(scheduledAt.getTime())) throw Error("Data e ora ufficiali non valide");
  return prisma.$transaction(async tx => {
    const current = await tx.tournament.findFirst({ where: { isCurrent: true }, include: { matches: true, _count: { select: { teams: true } } } });
    if (!current) throw Error("Edizione corrente non trovata");
    if (current.status !== "FINISHED") throw Error("Concludi l’edizione corrente prima di crearne una nuova");
    if (!current.matches.length || current.matches.some(match => match.status !== "FINISHED")) throw Error("Il tabellone corrente contiene ancora incontri non conclusi");
    const finalRound = Math.max(0, ...current.matches.filter(match => match.round > 0).map(match => match.round));
    const final = current.matches.find(match => match.round === finalRound && match.position === 0);
    const thirdPlace = current.matches.find(match => match.round === finalRound && match.position === 1);
    if (!final?.winnerId || current._count.teams >= 4 && !thirdPlace?.winnerId) throw Error("Completa finale e podio prima di creare la nuova edizione");
    const organizer = await tx.organizer.findUnique({ where: { id: "main" } });
    if (!organizer) throw Error("Organizzatore non configurato");
    const maximum = await tx.tournament.aggregate({ _max: { editionNumber: true } });
    const editionNumber = (maximum._max.editionNumber ?? current.editionNumber) + 1;
    const now = new Date();
    await tx.tournament.update({ where: { id: current.id }, data: { isCurrent: false, archivedAt: current.archivedAt ?? now } });
    return tx.tournament.create({ data: {
      name: TOURNAMENT_NAME, edition: `${editionNumber}° edizione`, editionNumber, scheduledAt, isCurrent: true,
      status: "SETUP", adminPasswordHash: organizer.adminPasswordHash,
    }, select: { id: true, editionNumber: true, edition: true, scheduledAt: true, status: true, isCurrent: true } });
  }, TX);
}

async function historicalTournament(tx: any, id: string) {
  const tournament = await tx.tournament.findUnique({ where: { id }, include: PUBLIC_INCLUDE });
  if (!tournament) throw Error("Edizione non trovata");
  if (tournament.isCurrent || tournament.status !== "FINISHED") throw Error("Questa operazione è riservata alle edizioni archiviate");
  return tournament;
}

export async function updateHistoricalDate(id: string, scheduledAt: Date) {
  if (Number.isNaN(scheduledAt.getTime())) throw Error("Data e ora ufficiali non valide");
  return prisma.$transaction(async tx => {
    await historicalTournament(tx, id);
    return tx.tournament.update({ where: { id }, data: { scheduledAt }, select: { scheduledAt: true, updatedAt: true } });
  }, TX);
}

function teamValues(playerOne: unknown, playerTwo: unknown) {
  const one = String(playerOne ?? "").trim().replace(/\s+/g, " ");
  const two = String(playerTwo ?? "").trim().replace(/\s+/g, " ");
  if (one.length < 3 || two.length < 3) throw Error("Inserisci nome e cognome di entrambi i giocatori");
  if (one.length > 80 || two.length > 80) throw Error("I nominativi sono troppo lunghi");
  return { playerOne: one, playerTwo: two, name: `${one} / ${two}` };
}

export async function renameHistoricalTeam(tournamentId: string, teamId: string, playerOne: unknown, playerTwo: unknown) {
  const values = teamValues(playerOne, playerTwo);
  return prisma.$transaction(async tx => {
    const tournament = await historicalTournament(tx, tournamentId);
    if (!tournament.teams.some((team: any) => team.id === teamId)) throw Error("Coppia non trovata");
    const team = await tx.team.update({ where: { id: teamId }, data: values, select: { id: true, name: true, playerOne: true, playerTwo: true } });
    await tx.tournament.update({ where: { id: tournamentId }, data: { updatedAt: new Date() } });
    return team;
  }, TX);
}

function candidates(matches: any[]) {
  return matches.map(match => {
    const loser = match.winnerId === match.teamAId ? match.teamB : match.teamA;
    const scored = match.winnerId === match.teamAId ? match.scoreB : match.scoreA;
    const conceded = match.winnerId === match.teamAId ? match.scoreA : match.scoreB;
    return { id: loser.id, name: displayName(loser), difference: scored - conceded, scored, conceded };
  }).sort((a, b) => b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name));
}

function originalPreliminaries(tournament: any) {
  const expected = repechagePlan(tournament.teams.length).preliminaryMatches;
  const finalized = tournament.repechageFinalizedAt ? new Date(tournament.repechageFinalizedAt).getTime() : null;
  return tournament.matches
    .filter((match: any) => match.round === 1 && match.status === "FINISHED" && match.teamAId && match.teamBId && match.winnerId)
    .filter((match: any) => finalized === null || match.finishedAt && new Date(match.finishedAt).getTime() <= finalized)
    .sort((a: any, b: any) => new Date(a.finishedAt ?? 0).getTime() - new Date(b.finishedAt ?? 0).getTime() || a.position - b.position)
    .slice(0, expected);
}

function cutoffIdentity(items: any[], selections: number) {
  const cutoff = repechageCutoff(items, selections);
  return JSON.stringify({ ranked: cutoff.ranked.map((item: any) => item.id), guaranteed: cutoff.guaranteed.map((item: any) => item.id), tied: cutoff.tied.map((item: any) => item.id), remaining: cutoff.remaining, needsPlayoff: cutoff.needsPlayoff });
}

export async function correctHistoricalScore(tournamentId: string, matchId: string, scoreA: number, scoreB: number) {
  assertBocceScore(scoreA, scoreB);
  return prisma.$transaction(async tx => {
    const tournament = await historicalTournament(tx, tournamentId);
    const match = tournament.matches.find((item: any) => item.id === matchId);
    if (!match || match.status !== "FINISHED" || !match.teamAId || !match.teamBId || !match.winnerId) throw Error("Risultato non modificabile");
    const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
    if (winnerId !== match.winnerId) throw Error("Nelle edizioni archiviate il vincitore non può cambiare");
    if (tournament.drawMode === "REPECHAGE") {
      const originals = originalPreliminaries(tournament), index = originals.findIndex((item: any) => item.id === match.id);
      if (index >= 0) {
        const selections = repechagePlan(tournament.teams.length).selections;
        const before = cutoffIdentity(candidates(originals), selections);
        const proposed = originals.map((item: any, position: number) => position === index ? { ...item, scoreA, scoreB } : item);
        const after = cutoffIdentity(candidates(proposed), selections);
        if (before !== after) throw Error("La correzione cambierebbe la graduatoria dei ripescaggi e non è consentita nello storico");
      }
    }
    const result = await tx.match.update({ where: { id: match.id }, data: { scoreA, scoreB } });
    await tx.tournament.update({ where: { id: tournamentId }, data: { updatedAt: new Date() } });
    return result;
  }, TX);
}
