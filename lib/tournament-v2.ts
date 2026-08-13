import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./db";
import { assertBocceScore, bracketSize, firstRoundSlots, matchDependencyGraph, lateEntryPlans, MAX_CONCURRENT_MATCHES, MAX_TEAMS, MIN_WINNING_SCORE, repechageCutoff, repechagePlan, repechagePlayoffWave, repechageRoundSlots, shuffleItems } from "./bracket";

export const PUBLIC_INCLUDE = {
  matches: { orderBy: [{ round: "asc" as const }, { position: "asc" as const }], include: { teamA: true, teamB: true, winner: true } },
  teams: { orderBy: { name: "asc" as const } },
};

const displayName = (team: { name: string; playerOne?: string | null; playerTwo?: string | null }) => team.playerOne && team.playerTwo ? `${team.playerOne} / ${team.playerTwo}` : team.name;

const TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000,
} as const;

function bracketMatchRows(tournamentId: string, size: number, slots: Array<{ id: string } | null>, teamCount: number) {
  const rows: Array<{ tournamentId: string; round: number; position: number; teamAId?: string | null; teamBId?: string | null }> = [];
  for (let round = 1; round <= Math.log2(size); round++) {
    for (let position = 0; position < size / 2 ** round; position++) {
      rows.push({
        tournamentId,
        round,
        position,
        teamAId: round === 1 ? slots[position * 2]?.id ?? null : null,
        teamBId: round === 1 ? slots[position * 2 + 1]?.id ?? null : null,
      });
    }
  }
  if (teamCount >= 4) rows.push({ tournamentId, round: Math.log2(size), position: 1 });
  return rows;
}

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

function defeatedCandidatesFrom(matches: any[]) {
  return matches.filter((match: any) => match.status === "FINISHED" && Math.max(match.scoreA, match.scoreB) >= MIN_WINNING_SCORE && match.teamA && match.teamB && match.winnerId).map((match: any) => {
    const loser = match.winnerId === match.teamAId ? match.teamB : match.teamA;
    const scored = match.winnerId === match.teamAId ? match.scoreB : match.scoreA;
    const conceded = match.winnerId === match.teamAId ? match.scoreA : match.scoreB;
    return { id: loser.id, name: displayName(loser), difference: scored - conceded, scored, conceded };
  }).sort((a: any, b: any) => b.difference - a.difference || b.scored - a.scored || a.name.localeCompare(b.name));
}

function repechage(tournament: any) {
  if (tournament.drawMode !== "REPECHAGE" || tournament.teams.length < 2) return null;
  const plan = repechagePlan(tournament.teams.length);
  if (!plan.selections) return null;
  const firstRound = tournament.matches.filter((match: any) => match.round === 1);
  const originals = originalPreliminaries(tournament);
  const originalIds = new Set(originals.map((match: any) => match.id));
  const candidates = defeatedCandidatesFrom(originals);
  const ready = originals.length === plan.preliminaryMatches;
  const cutoff = ready ? repechageCutoff(candidates, plan.selections) : null;
  const playoffMatches = tournament.matches.filter((match: any) => match.round === 0);
  const eliminated = new Set(playoffMatches.filter((match: any) => match.status === "FINISHED" && match.winnerId).map((match: any) => match.winnerId === match.teamAId ? match.teamBId : match.teamAId));
  const survivors = cutoff?.tied.filter((candidate: any) => !eliminated.has(candidate.id)) ?? [];
  const unfinishedPlayoffs = playoffMatches.filter((match: any) => match.status !== "FINISHED").length;
  let action: "GENERATE_PLAYOFFS" | "CONTINUE_PLAYOFFS" | "CONFIRM_SELECTIONS" | null = null;
  if (ready && !tournament.repechageFinalizedAt) {
    if (!cutoff?.needsPlayoff) action = "CONFIRM_SELECTIONS";
    else if (!playoffMatches.length) action = "GENERATE_PLAYOFFS";
    else if (!unfinishedPlayoffs) action = survivors.length > cutoff.remaining ? "CONTINUE_PLAYOFFS" : "CONFIRM_SELECTIONS";
  }
  const assignments = firstRound.filter((match: any) => !originalIds.has(match.id) && match.winnerId).map((match: any) => {
    const selected = candidates.find((candidate: any) => candidate.id === match.winnerId);
    return selected ? { matchId: match.id, teamId: selected.id, team: selected.name, opponent: null } : null;
  }).filter(Boolean);
  const selectedIds = new Set(assignments.map((item: any) => item.teamId));
  if (!tournament.repechageFinalizedAt && cutoff && !cutoff.needsPlayoff) cutoff.ranked.slice(0, plan.selections).forEach((candidate: any) => selectedIds.add(candidate.id));
  if (!tournament.repechageFinalizedAt && cutoff?.needsPlayoff) {
    cutoff.guaranteed.forEach((candidate: any) => selectedIds.add(candidate.id));
    if (playoffMatches.length && !unfinishedPlayoffs && survivors.length <= cutoff.remaining) survivors.forEach((candidate: any) => selectedIds.add(candidate.id));
  }
  const tiedIds = new Set(cutoff?.tied.map((candidate: any) => candidate.id) ?? []);
  const ranking = candidates.map((candidate: any, index: number) => ({
    ...candidate, rank: index + 1,
    outcome: selectedIds.has(candidate.id) ? (tournament.repechageFinalizedAt ? "SELECTED" : "PROPOSED") : eliminated.has(candidate.id) ? "ELIMINATED" : tiedIds.has(candidate.id) && cutoff?.needsPlayoff ? "PLAYOFF" : "OUT"
  }));
  const slots = firstRound.filter((match: any) => !originalIds.has(match.id) && !match.teamAId && !match.teamBId).map((match: any) => ({ id: match.id, opponent: null }));
  const playoffs = playoffMatches.map((match: any) => ({ id: match.id, a: match.teamA ? displayName(match.teamA) : null, b: match.teamB ? displayName(match.teamB) : null, status: match.status, winner: match.winner ? displayName(match.winner) : null }));
  return { automatic: true, requiresAdmin: true, finalized: Boolean(tournament.repechageFinalizedAt), action, qualifying: { completed: originals.length, total: plan.preliminaryMatches }, selections: plan.selections, assigned: assignments.length, ready, needsPlayoff: Boolean(cutoff?.needsPlayoff), guaranteed: cutoff?.guaranteed.map((team: any) => team.name) ?? [], candidates, ranking, slots, assignments, playoffs };
}

function teamManagement(tournament: any) {
  const teamCount = tournament.teams.length;
  const hasPlayedMatch = tournament.matches.some((match: any) => match.status === "FINISHED" && match.teamAId && match.teamBId);
  const canRebuild = tournament.status !== "FINISHED" && !hasPlayedMatch;
  const repechageLocked = tournament.drawMode === "REPECHAGE" && (
    Boolean(tournament.repechageFinalizedAt) ||
    tournament.matches.some((match: any) => match.round === 0 && ["LIVE", "FINISHED"].includes(match.status))
  );
  const slots = hasPlayedMatch && !repechageLocked ? lateEntryPlans(tournament.matches) : [];
  const canAdd = teamCount < MAX_TEAMS && tournament.status !== "FINISHED" && (canRebuild || slots.length > 0);
  const mode = tournament.status === "FINISHED" ? "finished" :
    teamCount >= MAX_TEAMS ? "full" :
    canRebuild ? (tournament.status === "SETUP" ? "setup" : "redraw") :
    repechageLocked ? "repechage-locked" :
    slots.length ? "slot" : "no-slot";
  return { canAdd, canRemove: canRebuild, availableSlots: slots.length, mode };
}

export function publicTournament(tournament: any) {
  if (!tournament) return null;
  const management = teamManagement(tournament);
  return {
    id: tournament.id, name: tournament.name, edition: tournament.edition, status: tournament.status, drawMode: tournament.drawMode,
    teams: tournament.teams.length, canChangeStructure: management.canRemove, teamManagement: management, teamList: tournament.teams.map((team: any) => ({ id: team.id, name: displayName(team), playerOne: team.playerOne, playerTwo: team.playerTwo })),
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


async function advanceResult(tx: any, tournamentId: string, match: { round: number; position: number; teamAId: string | null; teamBId: string | null }, winnerId: string) {
  await advance(tx, tournamentId, match.round, match.position, winnerId);
  const last = await tx.match.findFirst({ where: { tournamentId, round: { gt: 0 } }, orderBy: { round: "desc" }, select: { round: true } });
  if (!last || match.round !== last.round - 1) return;
  const thirdPlace = await tx.match.findUnique({ where: { tournamentId_round_position: { tournamentId, round: last.round, position: 1 } } });
  if (!thirdPlace) return;
  const loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId;
  if (!loserId) return;
  await tx.match.update({ where: { id: thirdPlace.id }, data: { [match.position % 2 === 0 ? "teamAId" : "teamBId"]: loserId } });
}

async function advanceByes(tx: any, tournamentId: string) {
  let changed = true;
  while (changed) {
    changed = false;
    const matches = await tx.match.findMany({ where: { tournamentId, status: "SCHEDULED" }, orderBy: [{ round: "asc" }, { position: "asc" }] });
    const lastRound = Math.max(0, ...matches.map((match: any) => match.round));
    for (const match of matches) {
      if (match.round === lastRound && match.position === 1) continue;
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

async function progressAutomaticRepechage(tx: any, tournamentId: string) {
  const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: PUBLIC_INCLUDE });
  if (!tournament) throw Error("Torneo non trovato");
  if (tournament.drawMode !== "REPECHAGE" || tournament.teams.length < 2) throw Error("Ripescaggi non disponibili per questo torneo");
  if (tournament.repechageFinalizedAt) throw Error("I ripescaggi sono già stati confermati");
  const plan = repechagePlan(tournament.teams.length);
  if (!plan.selections) throw Error("Non sono necessari ripescaggi con questo numero di coppie");
  const candidates = defeatedCandidatesFrom(originalPreliminaries(tournament));
  if (candidates.length !== plan.preliminaryMatches) throw Error("Completa tutti i preliminari prima di confermare la classifica");
  const cutoff = repechageCutoff(candidates, plan.selections);
  let qualifiers: any[];
  if (cutoff.needsPlayoff) {
    const playoffs = tournament.matches.filter((match: any) => match.round === 0);
    const unfinished = playoffs.filter((match: any) => match.status !== "FINISHED");
    const eliminated = new Set(playoffs.filter((match: any) => match.status === "FINISHED" && match.winnerId).map((match: any) => match.winnerId === match.teamAId ? match.teamBId : match.teamAId));
    const survivors = cutoff.tied.filter((candidate: any) => !eliminated.has(candidate.id));
    if (unfinished.length) throw Error("Completa tutti gli spareggi prima di continuare");
    if (survivors.length > cutoff.remaining) {
      const pairs = repechagePlayoffWave(survivors, cutoff.remaining);
      const nextPosition = playoffs.reduce((max: number, match: any) => Math.max(max, match.position + 1), 0);
      await tx.match.createMany({
        data: pairs.map((pair, index) => ({ tournamentId, round: 0, position: nextPosition + index, teamAId: pair[0].id, teamBId: pair[1].id }))
      });
      await schedule(tx, tournamentId);
      return;
    }
    qualifiers = [...cutoff.guaranteed, ...survivors];
  } else qualifiers = cutoff.ranked.slice(0, plan.selections);
  if (qualifiers.length !== plan.selections) throw Error("Impossibile completare i ripescaggi automatici");
  const targets = tournament.matches.filter((match: any) => match.round === 1 && match.status !== "FINISHED" && !match.teamAId && !match.teamBId).sort((a: any, b: any) => a.position - b.position);
  if (targets.length < qualifiers.length) throw Error("Posti di ripescaggio non disponibili");
  for (const [index, qualifier] of qualifiers.entries()) {
    await tx.match.update({ where: { id: targets[index].id }, data: { teamAId: qualifier.id, teamBId: null, status: "SCHEDULED", scoreA: 0, scoreB: 0, winnerId: null, startedAt: null, finishedAt: null } });
  }
  await advanceByes(tx, tournamentId);
  await schedule(tx, tournamentId);
  await tx.tournament.update({ where: { id: tournamentId }, data: { repechageFinalizedAt: new Date() } });
}


export async function confirmAutomaticRepechage(tournamentId: string) {
  return prisma.$transaction(async tx => progressAutomaticRepechage(tx, tournamentId), TRANSACTION_OPTIONS);
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
    const shuffled = shuffleItems(teams);
    const slots = drawMode === "REPECHAGE" ? repechageRoundSlots(shuffled) : firstRoundSlots(shuffled);
    const keepLive = rebuild && tournament.status === "LIVE";
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.match.createMany({ data: bracketMatchRows(tournamentId, size, slots, teams.length) });
    await advanceByes(tx, tournamentId);
    if (keepLive) await schedule(tx, tournamentId);
    return tx.tournament.update({ where: { id: tournamentId }, data: { status: keepLive ? "LIVE" : "READY", drawMode, startedAt: keepLive ? tournament.startedAt ?? new Date() : null, finishedAt: null, repechageFinalizedAt: null }, include: PUBLIC_INCLUDE });
  }, TRANSACTION_OPTIONS);
}


const TEST_FIRST_NAMES = ["Andrea", "Luca", "Marco", "Paolo", "Matteo", "Davide", "Simone", "Antonio", "Giuseppe", "Francesco", "Michele", "Stefano", "Alessandro", "Roberto", "Fabio", "Nicola"];
const TEST_LAST_NAMES = ["Rossi", "Bianchi", "Romano", "Esposito", "Ferrari", "Gallo", "Bruno", "Ricci", "Marino", "Greco", "Conti", "De Luca", "Costa", "Mancini", "Lombardi", "Moretti"];

export async function generateTestTeams(tournamentId: string, count: number) {
  if (!Number.isInteger(count) || count < 1 || count > MAX_TEAMS) throw Error("Numero di coppie test non valido");
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: { teams: true } });
    if (!tournament) throw Error("Torneo non trovato");
    if (tournament.status !== "SETUP") throw Error("Le coppie di prova si possono generare solo prima del sorteggio");
    if (tournament.teams.length + count > MAX_TEAMS) throw Error("Puoi aggiungere al massimo " + (MAX_TEAMS - tournament.teams.length) + " coppie");
    const token = Date.now().toString(36).slice(-4).toUpperCase();
    const people = shuffleItems(Array.from({ length: count * 2 }, (_, index) => {
      const first = TEST_FIRST_NAMES[(index * 7 + tournament.teams.length) % TEST_FIRST_NAMES.length];
      const last = TEST_LAST_NAMES[(index * 11 + Math.floor(index / TEST_FIRST_NAMES.length)) % TEST_LAST_NAMES.length];
      return first + " " + last + " · Test " + token + String(index + 1).padStart(2, "0");
    }));
    const data = Array.from({ length: count }, (_, index) => {
      const playerOne = people[index * 2], playerTwo = people[index * 2 + 1];
      return { tournamentId, playerOne, playerTwo, name: playerOne + " / " + playerTwo };
    });
    return tx.team.createManyAndReturn({
      data,
      select: { id: true, name: true, playerOne: true, playerTwo: true }
    });
  }, TRANSACTION_OPTIONS);
}

export async function addTournamentTeam(tournamentId: string, values: { name: string; playerOne: string; playerTwo: string }) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({
      where: { id: tournamentId },
      include: { teams: true, matches: { orderBy: [{ round: "asc" }, { position: "asc" }] } }
    });
    if (!tournament) throw Error("Torneo non trovato");
    if (tournament.status === "FINISHED") throw Error("Il torneo è concluso: puoi soltanto correggere i nominativi");
    if (tournament.teams.length >= MAX_TEAMS) throw Error("Sono ammesse al massimo " + MAX_TEAMS + " coppie");

    const hasPlayedMatch = tournament.matches.some(match => match.status === "FINISHED" && match.teamAId && match.teamBId);
    const team = await tx.team.create({
      data: { tournamentId, ...values },
      select: { id: true, name: true, playerOne: true, playerTwo: true }
    });

    if (!hasPlayedMatch) {
      if (tournament.status === "SETUP" || tournament.matches.length === 0) return { team, regenerated: false, placement: null };

      const teams = [...tournament.teams, team];
      const size = bracketSize(teams.length);
      const shuffled = shuffleItems(teams);
      const slots = tournament.drawMode === "REPECHAGE" ? repechageRoundSlots(shuffled) : firstRoundSlots(shuffled);
      await tx.match.deleteMany({ where: { tournamentId } });
      await tx.match.createMany({ data: bracketMatchRows(tournamentId, size, slots, teams.length) });
      await advanceByes(tx, tournamentId);
      if (tournament.status === "LIVE") await schedule(tx, tournamentId);
      await tx.tournament.update({
        where: { id: tournamentId },
        data: { finishedAt: null, repechageFinalizedAt: null }
      });
      return { team, regenerated: true, placement: null };
    }

    const lockedPlayoff = tournament.drawMode === "REPECHAGE" && (
      Boolean(tournament.repechageFinalizedAt) ||
      tournament.matches.some(match => match.round === 0 && ["LIVE", "FINISHED"].includes(match.status))
    );
    if (lockedPlayoff) throw Error("I ripescaggi sono già in corso: non è più possibile aggiungere una coppia senza alterare risultati validi");

    const plan = lateEntryPlans(tournament.matches)[0];
    if (!plan) throw Error("Non esiste uno slot libero sicuro: nessun risultato giocato verrà cancellato");

    if (tournament.drawMode === "REPECHAGE") {
      await tx.match.deleteMany({ where: { tournamentId, round: 0 } });
    }

    await tx.match.updateMany({
      where: { tournamentId, id: { in: plan.resetMatchIds } },
      data: { status: "SCHEDULED", field: null, scoreA: 0, scoreB: 0, winnerId: null, startedAt: null, finishedAt: null }
    });
    for (const clear of plan.clearSlots) {
      await tx.match.update({ where: { id: clear.matchId }, data: { [clear.slot]: null } });
    }
    await tx.match.update({
      where: { id: plan.matchId },
      data: { [plan.openSlot]: team.id, status: "SCHEDULED", field: null, scoreA: 0, scoreB: 0, winnerId: null, startedAt: null, finishedAt: null }
    });
    await tx.tournament.update({
      where: { id: tournamentId },
      data: { status: "LIVE", finishedAt: null, repechageFinalizedAt: null }
    });
    await schedule(tx, tournamentId);

    const opponent = tournament.teams.find(item => item.id === plan.opponentId);
    return {
      team,
      regenerated: false,
      placement: {
        matchId: plan.matchId,
        opponent: opponent ? displayName(opponent) : null,
        reopenedMatches: plan.resetMatchIds.length
      }
    };
  }, TRANSACTION_OPTIONS);
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
  }, TRANSACTION_OPTIONS);
}

const validScore = assertBocceScore;

export async function updateMatchStatus(tournamentId: string, matchId: string, status: "READY" | "LIVE") {
  return prisma.$transaction(async tx => {
    const match = await tx.match.findFirst({ where: { id: matchId, tournamentId } });
    if (!match || !match.teamAId || !match.teamBId || match.status === "FINISHED") throw Error("Stato incontro non modificabile");
    if (status === "LIVE") {
      const occupied = await tx.match.count({ where: { tournamentId, status: "LIVE", id: { not: match.id } } });
      if (occupied >= MAX_CONCURRENT_MATCHES) throw Error("Sono già presenti due incontri in corso: concludine uno prima di avviarne un altro");
    }
    await tx.match.update({ where: { id: match.id }, data: { status, field: null, startedAt: status === "LIVE" ? new Date() : null } });
  }, TRANSACTION_OPTIONS);
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
    if (match.round > 0) await advanceResult(tx, tournamentId, match, winnerId);
    if (tournament.drawMode === "PRELIMINARIES") await advanceByes(tx, tournamentId);
    await schedule(tx, tournamentId);
    const unfinished = await tx.match.count({ where: { tournamentId, status: { not: "FINISHED" } } });
    await tx.tournament.update({ where: { id: tournamentId }, data: unfinished ? {} : { status: "FINISHED", finishedAt: new Date() } });
    return result;
  }, TRANSACTION_OPTIONS);
}

export async function resetTournament(tournamentId: string) {
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId } });
    if (!tournament) throw Error("Torneo non trovato");
    await tx.match.deleteMany({ where: { tournamentId } });
    await tx.registration.deleteMany({ where: { tournamentId } });
    await tx.team.deleteMany({ where: { tournamentId } });
    return tx.tournament.update({ where: { id: tournamentId }, data: { status: "SETUP", drawMode: "PRELIMINARIES", startedAt: null, finishedAt: null, repechageFinalizedAt: null } });
  }, TRANSACTION_OPTIONS);
}

type CascadeMatch = { id: string; round: number; position: number; teamAId: string | null; teamBId: string | null; status: string };
function dependenciesFrom(matches: CascadeMatch[], match: CascadeMatch) {
  return matchDependencyGraph(matches, match.id);
}

function originalPreliminaries(tournament: any) {
  const expected = repechagePlan(tournament.teams.length).preliminaryMatches;
  const finalizedAt = tournament.repechageFinalizedAt ? new Date(tournament.repechageFinalizedAt).getTime() : null;
  return tournament.matches
    .filter((match: any) => match.round === 1 && match.status === "FINISHED" && match.teamAId && match.teamBId && match.winnerId)
    .filter((match: any) => finalizedAt === null || match.finishedAt && new Date(match.finishedAt).getTime() <= finalizedAt)
    .sort((a: any, b: any) => new Date(a.finishedAt ?? 0).getTime() - new Date(b.finishedAt ?? 0).getTime() || a.position - b.position)
    .slice(0, expected);
}

function repechageCorrectionImpact(tournament: any, match: any, scoreA: number, scoreB: number) {
  if (tournament.drawMode !== "REPECHAGE" || (match.scoreA === scoreA && match.scoreB === scoreB)) return null;
  const originals = originalPreliminaries(tournament);
  const originalIds = new Set(originals.map((item: any) => item.id));
  if (match.round !== 0 && !originalIds.has(match.id)) return null;
  const affected = tournament.matches.filter((item: any) =>
    item.id !== match.id && (
      item.round > 1 ||
      item.round === 1 && !originalIds.has(item.id) ||
      item.round === 0 && (match.round !== 0 || item.position > match.position)
    )
  );
  return { originals, affected };
}

async function restartRepechageAfterCorrection(tx: any, tournament: any, source: any, scoreA: number, scoreB: number, winnerId: string, originals: any[]) {
  const originalIds = new Set(originals.map(match => match.id));
  const oldCandidateIds = new Set(originals.map(match => match.winnerId === match.teamAId ? match.teamBId : match.teamAId).filter(Boolean));

  await tx.tournament.update({ where: { id: tournament.id }, data: { status: "LIVE", finishedAt: null, repechageFinalizedAt: null } });
  if (source.round === 0) await tx.match.deleteMany({ where: { tournamentId: tournament.id, round: 0, position: { gt: source.position } } });
  else await tx.match.deleteMany({ where: { tournamentId: tournament.id, round: 0 } });

  for (const match of tournament.matches.filter((item: any) => item.round === 1 && !originalIds.has(item.id))) {
    const teamAId = match.teamAId && !oldCandidateIds.has(match.teamAId) ? match.teamAId : null;
    const teamBId = match.teamBId && !oldCandidateIds.has(match.teamBId) ? match.teamBId : null;
    await tx.match.update({ where: { id: match.id }, data: { teamAId, teamBId, status: "SCHEDULED", field: null, scoreA: 0, scoreB: 0, winnerId: null, startedAt: null, finishedAt: null } });
  }

  await tx.match.updateMany({
    where: { tournamentId: tournament.id, round: { gt: 1 } },
    data: { teamAId: null, teamBId: null, status: "SCHEDULED", field: null, scoreA: 0, scoreB: 0, winnerId: null, startedAt: null, finishedAt: null }
  });
  await tx.match.update({ where: { id: source.id }, data: { scoreA, scoreB, winnerId, status: "FINISHED", field: null, finishedAt: source.finishedAt ?? new Date() } });

  for (const match of originals) {
    const originalWinner = match.id === source.id ? winnerId : match.winnerId;
    if (originalWinner) await advanceResult(tx, tournament.id, match, originalWinner);
  }
  await schedule(tx, tournament.id);
}

export async function previewCorrection(tournamentId: string, matchId: string, scoreA: number, scoreB: number) {
  validScore(scoreA, scoreB);
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, include: PUBLIC_INCLUDE });
  const match = tournament?.matches.find(item => item.id === matchId);
  if (!tournament || !match || match.status !== "FINISHED" || !match.teamAId || !match.teamBId) throw Error("Risultato non modificabile");
  const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
  const repechageImpact = repechageCorrectionImpact(tournament, match, scoreA, scoreB);
  const dependency = dependenciesFrom(tournament.matches, match);
  const cascade = repechageImpact ? repechageImpact.affected : winnerId !== match.winnerId ? dependency.affected : [];
  return {
    changesWinner: winnerId !== match.winnerId,
    restartsRepechage: Boolean(repechageImpact),
    affected: cascade.map((item: any) => ({ id: item.id, round: item.round, position: item.position, status: item.status }))
  };
}

export async function correctResult(tournamentId: string, matchId: string, scoreA: number, scoreB: number, confirmCascade = false) {
  validScore(scoreA, scoreB);
  return prisma.$transaction(async tx => {
    const tournament = await tx.tournament.findUnique({ where: { id: tournamentId }, include: PUBLIC_INCLUDE });
    const match = tournament?.matches.find(item => item.id === matchId);
    if (!tournament || !match || match.status !== "FINISHED" || !match.teamAId || !match.teamBId) throw Error("Risultato non modificabile");
    const winnerId = scoreA > scoreB ? match.teamAId : match.teamBId;
    const repechageImpact = repechageCorrectionImpact(tournament, match, scoreA, scoreB);
    const dependency = dependenciesFrom(tournament.matches, match);
    const cascade = repechageImpact ? repechageImpact.affected : winnerId !== match.winnerId ? dependency.affected : [];
    if (cascade.length && !confirmCascade) throw Error("Conferma necessaria per riaprire gli incontri successivi");

    if (repechageImpact) {
      await restartRepechageAfterCorrection(tx, tournament, match, scoreA, scoreB, winnerId, repechageImpact.originals);
    } else {
      await tx.match.update({ where: { id: match.id }, data: { scoreA, scoreB, winnerId } });
      if (cascade.length) {
        for (const item of cascade) await tx.match.update({ where: { id: item.id }, data: { status: "SCHEDULED", field: null, scoreA: 0, scoreB: 0, winnerId: null, startedAt: null, finishedAt: null } });
        const loserId = winnerId === match.teamAId ? match.teamBId : match.teamAId;
        for (const edge of dependency.edges) {
          const participantId = edge.fromId === match.id ? (edge.outcome === "winner" ? winnerId : loserId) : null;
          await tx.match.update({ where: { id: edge.toId }, data: { [edge.slot]: participantId } });
        }
        await schedule(tx, tournamentId);
      }
      await tx.tournament.update({ where: { id: tournamentId }, data: { status: cascade.length ? "LIVE" : undefined, finishedAt: cascade.length ? null : undefined } });
    }
    return { affected: cascade.map((item: any) => item.id) };
  }, TRANSACTION_OPTIONS);
}
