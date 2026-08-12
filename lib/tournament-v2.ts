import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./db";
import { assertBocceScore, bracketSize, cascadeCoordinates, firstRoundSlots, repechagePlan, shuffleItems } from "./bracket";

export const PUBLIC_INCLUDE = {
  matches: { orderBy: [{ round: "asc" as const }, { position: "asc" as const }], include: { teamA: true, teamB: true, winner: true } },
  teams: { orderBy: { name: "asc" as const } },
};

const displayName = (team: { name: string; playerOne?: string | null; playerTwo?: string | null }) => team.playerOne && team.playerTwo ? `${team.playerOne} / ${team.playerTwo}` : team.name;

export async function getTournamentSummary() {
  return prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, status: true, drawMode: true, startedAt: true, finishedAt: true } });
}

export async function getTournament() {
  const tournament = await prisma.tournament.findFirst({ orderBy: { createdAt: "desc" }, include: PUBLIC_INCLUDE });
  if (tournament?.status === "LIVE" && tournament.teams.length >= 2 && tournament.matches.length > 0 && tournament.matches.every(match => match.status === "FINISHED")) {
    return prisma.tournament.update({ where: { id: tournament.id }, data: { status: "FINISHED", finishedAt: tournament.finishedAt ?? new Date() }, include: PUBLIC_INCLUDE });
  }
  return tournament;
}

function repechage(tournament: any) {
  if (tournament.drawMode !== "REPECHAGE" || tournament.repechageFinalizedAt || tournament.teams.length < 2) return null;
  const plan = repechagePlan(tournament.teams.length);
  if (!plan.selections) return null;
  const firstRound = tournament.matches.filter((match: any) => match.round === 1);
  const qualifying = firstRound.filter((match: any) => match.status === "FINISHED" && Math.max(match.scoreA, match.scoreB) >= 11 && match.teamA && match.teamB && match.winnerId);
  const candidates = qualifying.map((match: any) => {
    const loser = match.winnerId === match.teamAId ? match.teamB : match.teamA;
    const scored = match.winnerId === match.teamAId ? match.scoreB : match.scoreA;
    const conceded = match.winnerId === match.teamAId ? match.scoreA : match.scoreB;
    return { id: loser.id, name: displayName(loser), difference: scored - conceded, scored, conceded };
  }).sort((a: any, b: any) => b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name));
  const allQualifiersFinished = qualifying.length === plan.preliminaryMatches;
  const used = new Set(firstRound.filter((match: any) => match.status === "SCHEDULED" && match.teamA && match.teamB).flatMap((match: any) => [match.teamAId, match.teamBId]));
  const assignments = firstRound.filter((match: any) => match.status === "SCHEDULED" && match.teamA && match.teamB).map((match: any) => {
    const selected = candidates.find((candidate: any) => candidate.id === match.teamAId || candidate.id === match.teamBId);
    return selected ? { matchId: match.id, teamId: selected.id, team: selected.name, opponent: displayName(match.teamAId === selected.id ? match.teamB : match.teamA) } : null;
  }).filter(Boolean);
  const slots = firstRound.filter((match: any) => match.status === "SCHEDULED" && Boolean(match.teamAId) !== Boolean(match.teamBId)).map((match: any) => ({ id: match.id, opponent: displayName(match.teamA ?? match.teamB) }));
  return { qualifying: { completed: qualifying.length, total: plan.preliminaryMatches }, selections: plan.selections, assigned: assignments.length, ready: allQualifiersFinished, candidates: candidates.filter((candidate: any) => !used.has(candidate.id)), slots, assignments };
}
export function publicTournament(tournament: any) {
  if (!tournament) return null;
  return {
    id: tournament.id, name: tournament.name, edition: tournament.edition, status: tournament.status, drawMode: tournament.drawMode,
    teams: tournament.teams.length, canChangeStructure: tournament.teams.length < 2 || (tournament.status !== "FINISHED" && !tournament.matches.some((match: any) => match.status === "FINISHED" && match.teamA && match.teamB)), teamList: tournament.teams.map((team: any) => ({ id: team.id, name: displayName(team), playerOne: team.playerOne, playerTwo: team.playerTwo })),
    repechage: repechage(tournament), updatedAt: tournament.updatedAt,
    matches: tournament.matches.map((match: any) => ({ id: match.id, round: match.round, position: match.position, field: match.field, a: match.teamA ? displayName(match.teamA) : null, b: match.teamB ? displayName(match.teamB) : null, scoreA: match.scoreA, scoreB: match.scoreB, status: match.status, winner: match.winner ? displayName(match.winner) : null })),
  };
}

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
  // La coda resta esplicita: solo l'organizzatore chiama le coppie e le porta in campo.
  await tx.match.updateMany({ where: { tournamentId, status: "SCHEDULED", teamAId: { not: null }, teamBId: { not: null } }, data: { status: "READY", field: null } });
}

export async function generateDraw(tournamentId: string, drawMode: "PRELIMINARIES" | "REPECHAGE" = "PRELIMINARIES", rebuild = false) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw Error("Torneo non trovato");
    if (tournament.status !== "SETUP" && !rebuild) throw Error("Il sorteggio è consentito solo durante la configurazione");
    const teams = await tx.team.findMany({ where: { tournamentId } });
    if (rebuild) {
      const played = await tx.match.count({ where: { tournamentId, status: "FINISHED", teamAId: { not: null }, teamBId: { not: null } } });
      if (played) throw Error("Ci sono risultati registrati: puoi modificare i nomi, ma non aggiungere o rimuovere coppie");
    }
    const size = bracketSize(teams.length);
    const slots = firstRoundSlots(shuffleItems(teams));
    const keepLive = rebuild && tournament.status === "LIVE";
    await tx.match.deleteMany({ where: { tournamentId } });
    for (let round = 1; round <= Math.log2(size); round++) for (let position = 0; position < size / 2 ** round; position++) await tx.match.create({ data: { tournamentId, round, position, teamAId: round === 1 ? slots[position * 2]?.id ?? null : null, teamBId: round === 1 ? slots[position * 2 + 1]?.id ?? null : null } });
    if (drawMode === "PRELIMINARIES") await advanceByes(tx, tournamentId);
    if (keepLive) await schedule(tx, tournamentId);
    return tx.tournament.update({ where: { id: tournamentId }, data: { status: keepLive ? "LIVE" : "READY", drawMode, startedAt: keepLive ? tournament.startedAt ?? new Date() : null, finishedAt: null, repechageFinalizedAt: null }, include: PUBLIC_INCLUDE });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function regenerateDraw(tournamentId: string) {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.status === "SETUP") return null;
  return generateDraw(tournamentId, tournament.drawMode, true);
}

export async function launchTournament(tournamentId: string, drawMode: "PRELIMINARIES" | "REPECHAGE" = "PRELIMINARIES") {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw Error("Torneo non trovato");
  if (tournament.status === "SETUP") await generateDraw(tournamentId, drawMode);
  return startTournament(tournamentId);
}

export async function startTournament(tournamentId: string) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament || tournament.status !== "READY") throw Error("Il torneo non è pronto");
    await schedule(tx, tournamentId);
    return tx.tournament.update({ where: { id: tournamentId }, data: { status: "LIVE", startedAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const validScore = assertBocceScore;

export async function updateMatchStatus(tournamentId: string, matchId: string, status: "READY" | "WAITING" | "LIVE") {
  return prisma.$transaction(async tx => {
    const match = await tx.match.findFirst({ where: { id: matchId, tournamentId } });
    if (!match || !match.teamAId || !match.teamBId || match.status === "FINISHED") throw Error("Stato incontro non modificabile");
    if (status === "WAITING" || status === "LIVE") {
      const occupied = await tx.match.count({ where: { tournamentId, status: { in: ["WAITING", "LIVE"] }, id: { not: match.id } } });
      if (occupied >= 2) throw Error("Sono già presenti due incontri da gestire: libera prima uno slot");
    }
    await tx.match.update({ where: { id: match.id }, data: { status, field: null, startedAt: status === "LIVE" ? new Date() : null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function submitResult(tournamentId: string, matchId: string, scoreA: number, scoreB: number) {
  validScore(scoreA, scoreB);
  return prisma.$transaction(async tx => {
    const match = await tx.match.findFirst({ where: { id: matchId, tournamentId } });
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!match || !tournament) throw Error("Partita non trovata");
    if (!(["READY", "WAITING", "LIVE"] as string[]).includes(match.status)) throw Error("La partita non è pronta per il risultato");
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
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: PUBLIC_INCLUDE });
    if (!tournament || tournament.drawMode !== "REPECHAGE" || tournament.status !== "LIVE" || tournament.repechageFinalizedAt) throw Error("Ripescaggi non disponibili");
    const panel = repechage(tournament);
    if (!panel?.ready) throw Error("Completa prima tutti i preliminari");
    if (panel.assigned >= panel.selections) throw Error("Hai già selezionato tutte le coppie ripescate");
    if (!panel.candidates.some((candidate: any) => candidate.id === teamId)) throw Error("La coppia non è selezionabile per il ripescaggio");
    const target = await tx.match.findFirst({ where: { id: matchId, tournamentId, round: 1, status: "SCHEDULED" } });
    if (!target || Boolean(target.teamAId) === Boolean(target.teamBId)) throw Error("Posto di ripescaggio non disponibile");
    await tx.match.update({ where: { id: target.id }, data: target.teamAId ? { teamBId: teamId } : { teamAId: teamId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function unassignRepechage(tournamentId: string, matchId: string) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: PUBLIC_INCLUDE });
    if (!tournament || tournament.drawMode !== "REPECHAGE" || tournament.status !== "LIVE" || tournament.repechageFinalizedAt) throw Error("Ripescaggi non disponibili");
    const panel = repechage(tournament);
    const assignment = panel?.assignments.find((item: any) => item.matchId === matchId);
    if (!assignment) throw Error("Ripescaggio non trovato");
    const target = await tx.match.findFirst({ where: { id: matchId, tournamentId, round: 1, status: "SCHEDULED" } });
    if (!target) throw Error("Posto di ripescaggio non disponibile");
    await tx.match.update({ where: { id: target.id }, data: target.teamAId === assignment.teamId ? { teamAId: null } : { teamBId: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function resetTournament(tournamentId: string) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw Error("Torneo non trovato");
    if (tournament.status === "LIVE" || tournament.status === "FINISHED" || tournament.startedAt) {
      throw Error("Il torneo ufficiale è già iniziato e non può essere azzerato");
    }
    await tx.match.deleteMany({ where: { tournamentId } });
    return tx.tournament.update({ where: { id: tournamentId }, data: { status: "SETUP", startedAt: null, finishedAt: null, repechageFinalizedAt: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function finalizeRepechage(tournamentId: string) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: PUBLIC_INCLUDE });
    if (!tournament || tournament.drawMode !== "REPECHAGE" || tournament.status !== "LIVE" || tournament.repechageFinalizedAt) throw Error("Ripescaggi non disponibili");
    const panel = repechage(tournament);
    if (!panel?.ready) throw Error("Completa prima tutti i preliminari");
    if (panel.assigned !== panel.selections) throw Error("Seleziona esattamente " + panel.selections + " coppie da ripescare");
    await advanceByes(tx, tournamentId);
    await schedule(tx, tournamentId);
    await tx.tournament.update({ where: { id: tournamentId }, data: { repechageFinalizedAt: new Date() } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

type CascadeMatch = { id: string; round: number; position: number; teamAId: string | null; teamBId: string | null; status: string };
function cascadeFrom(matches: CascadeMatch[], match: CascadeMatch) { const lastRound = Math.max(...matches.map(item => item.round)); return cascadeCoordinates(match.round, match.position, lastRound).map(coordinate => matches.find(item => item.round === coordinate.round && item.position === coordinate.position)).filter((item): item is CascadeMatch => Boolean(item)); }
export async function previewCorrection(tournamentId: string, matchId: string, scoreA: number, scoreB: number) { validScore(scoreA, scoreB); const matches = await prisma.match.findMany({ where: { tournamentId }, orderBy: [{ round: "asc" }, { position: "asc" }] }); const match = matches.find(item => item.id === matchId); if (!match || match.status !== "FINISHED" || !match.teamAId || !match.teamBId) throw Error("Risultato non modificabile"); const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId; const cascade = winnerId !== match.winnerId ? cascadeFrom(matches, match) : []; return { changesWinner: winnerId !== match.winnerId, affected: cascade.map(item => ({ id: item.id, round: item.round, position: item.position, status: item.status })) }; }
export async function correctResult(tournamentId: string, matchId: string, scoreA: number, scoreB: number, confirmCascade = false) { const preview = await previewCorrection(tournamentId, matchId, scoreA, scoreB); if (preview.affected.length && !confirmCascade) throw Error("Conferma necessaria per riaprire gli incontri successivi"); return prisma.$transaction(async tx => { const matches = await tx.match.findMany({ where: { tournamentId }, orderBy: [{ round: "asc" }, { position: "asc" }] }); const match = matches.find(item => item.id === matchId); if (!match || match.status !== "FINISHED" || !match.teamAId || !match.teamBId) throw Error("Risultato non modificabile"); const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId; const cascade = winnerId !== match.winnerId ? cascadeFrom(matches, match) : []; await tx.match.update({ where: { id: match.id }, data: { scoreA, scoreB, winnerId } }); if (cascade.length) { for (const item of cascade) await tx.match.update({ where: { id: item.id }, data: { status: "SCHEDULED", field: null, scoreA: 0, scoreB: 0, winnerId: null, startedAt: null, finishedAt: null } }); for (const [index, item] of cascade.entries()) { const previous = index === 0 ? match : cascade[index - 1]; const slot = previous.position % 2 === 0 ? "teamAId" : "teamBId"; await tx.match.update({ where: { id: item.id }, data: { [slot]: index === 0 ? winnerId : null } }); } await schedule(tx, tournamentId); } await tx.tournament.update({ where: { id: tournamentId }, data: { status: cascade.length ? "LIVE" : undefined, finishedAt: cascade.length ? null : undefined } }); return { affected: cascade.map(item => item.id) }; }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
