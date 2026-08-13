export const MAX_TEAMS = 64;
export const MAX_CONCURRENT_MATCHES = 2;
export const MIN_WINNING_SCORE = 12;
export const MAX_SCORE = 14;

export function bracketSize(teamCount: number) {
  if (!Number.isInteger(teamCount) || teamCount < 2 || teamCount > MAX_TEAMS) {
    throw Error(`Il numero di coppie deve essere compreso tra 2 e ${MAX_TEAMS}`);
  }
  return 2 ** Math.ceil(Math.log2(teamCount));
}

function spreadPositions(total: number, count: number) {
  if (count === 0) return [];
  return Array.from({ length: count }, (_, index) => Math.floor(((index + .5) * total) / count));
}

/**
 * Builds a valid first round: no empty-vs-empty matches and byes are spread
 * across the bracket instead of being grouped at the end.
 */
export function firstRoundSlots<T>(teams: T[]): Array<T | null> {
  const size = bracketSize(teams.length);
  const matchCount = size / 2;
  const fullMatches = teams.length - matchCount;
  const pairs = Array.from({ length: matchCount }, (_, index) => [teams[index], null] as [T, T | null]);

  spreadPositions(matchCount, fullMatches).forEach((position, index) => {
    pairs[position][1] = teams[matchCount + index];
  });

  return pairs.flat();
}


export const FIELD_COUNT = 2;

export function nextMatchCoordinate(round: number, position: number) {
  return { round: round + 1, position: Math.floor(position / 2), slot: position % 2 === 0 ? "a" as const : "b" as const };
}

export function availableFields(occupied: Array<number | null | undefined>, count = FIELD_COUNT) {
  const used = new Set(occupied.filter((field): field is number => Number.isInteger(field)));
  return Array.from({ length: count }, (_, index) => index + 1).filter(field => !used.has(field));
}

export function assertBocceScore(a: number, b: number) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > MAX_SCORE || b > MAX_SCORE || a === b || Math.max(a, b) < MIN_WINNING_SCORE) throw Error(`Il vincitore deve avere da ${MIN_WINNING_SCORE} a ${MAX_SCORE} punti; pareggi non ammessi`);
}


export function shuffleItems<T>(items: T[], random: () => number = Math.random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

export function repechagePlan(teamCount: number) {
  const size = bracketSize(teamCount);
  const preliminaryMatches = teamCount - size / 2;
  const byeSlots = size - teamCount;
  return { size, preliminaryMatches, byeSlots, selections: Math.min(preliminaryMatches, byeSlots) };
}


export type RepechageCandidate = { id: string; difference: number; scored: number };

export function repechageCutoff<T extends RepechageCandidate>(candidates: T[], selections: number) {
  const ranked = [...candidates].sort((a, b) => b.difference - a.difference || b.scored - a.scored || a.id.localeCompare(b.id));
  if (!Number.isInteger(selections) || selections < 0 || selections > ranked.length) throw Error("Numero di ripescaggi non valido");
  if (selections === 0) return { ranked, guaranteed: [] as T[], tied: [] as T[], remaining: 0, needsPlayoff: false };
  const cutoff = ranked[selections - 1];
  const better = (item: T) => item.difference > cutoff.difference || item.difference === cutoff.difference && item.scored > cutoff.scored;
  const equal = (item: T) => item.difference === cutoff.difference && item.scored === cutoff.scored;
  const guaranteed = ranked.filter(better), tied = ranked.filter(equal), remaining = selections - guaranteed.length;
  return { ranked, guaranteed, tied, remaining, needsPlayoff: tied.length > remaining };
}

export function repechagePlayoffWave<T>(survivors: T[], qualifierCount: number, random: () => number = Math.random) {
  if (!Number.isInteger(qualifierCount) || qualifierCount < 1 || qualifierCount >= survivors.length) throw Error("Spareggio non necessario");
  const shuffled = shuffleItems(survivors, random);
  const matchCount = Math.min(Math.floor(shuffled.length / 2), shuffled.length - qualifierCount);
  return Array.from({ length: matchCount }, (_, index) => [shuffled[index * 2], shuffled[index * 2 + 1]] as [T, T]);
}


export type LateEntryMatch = {
  id: string;
  round: number;
  position: number;
  teamAId: string | null;
  teamBId: string | null;
  winnerId: string | null;
  status: string;
};

export type LateEntryPlan = {
  matchId: string;
  openSlot: "teamAId" | "teamBId";
  opponentId: string;
  resetMatchIds: string[];
  clearSlots: Array<{ matchId: string; slot: "teamAId" | "teamBId" }>;
};

export function lateEntryPlans(matches: LateEntryMatch[]): LateEntryPlan[] {
  const byCoordinate = new Map(matches.map(match => [match.round + ":" + match.position, match]));
  const plans: LateEntryPlan[] = [];

  for (const source of matches.filter(match => match.round === 1 && Boolean(match.teamAId) !== Boolean(match.teamBId))) {
    const opponentId = source.teamAId ?? source.teamBId;
    if (!opponentId || source.status === "LIVE") continue;
    if (source.status === "FINISHED" && source.winnerId !== opponentId) continue;
    if (source.status !== "FINISHED" && source.winnerId) continue;

    const resetMatchIds = [source.id];
    const clearSlots: LateEntryPlan["clearSlots"] = [];
    let current = source;
    let valid = true;

    while (current.winnerId) {
      const coordinate = nextMatchCoordinate(current.round, current.position);
      const next = byCoordinate.get(coordinate.round + ":" + coordinate.position);
      if (!next) break;
      const slot = coordinate.slot === "a" ? "teamAId" : "teamBId";
      const propagated = next[slot];

      if (!propagated) break;
      if (propagated !== current.winnerId || next.status === "LIVE") { valid = false; break; }
      if (next.status === "FINISHED" && next.teamAId && next.teamBId) { valid = false; break; }
      if (next.winnerId && next.status !== "FINISHED") { valid = false; break; }

      clearSlots.push({ matchId: next.id, slot });
      resetMatchIds.push(next.id);
      if (next.status !== "FINISHED") break;
      if (next.winnerId !== current.winnerId) { valid = false; break; }
      current = next;
    }

    if (valid) plans.push({
      matchId: source.id,
      openSlot: source.teamAId ? "teamBId" : "teamAId",
      opponentId,
      resetMatchIds: [...new Set(resetMatchIds)],
      clearSlots
    });
  }

  return plans.sort((a, b) => a.resetMatchIds.length - b.resetMatchIds.length || a.matchId.localeCompare(b.matchId));
}


export type DependencyMatch = { id: string; round: number; position: number };
export type MatchDependency = {
  fromId: string;
  toId: string;
  slot: "teamAId" | "teamBId";
  outcome: "winner" | "loser";
};

export function matchDependencyGraph<T extends DependencyMatch>(matches: T[], sourceId: string) {
  const mainRounds = matches.filter(match => match.round > 0);
  const totalRounds = Math.max(0, ...mainRounds.map(match => match.round));
  const byCoordinate = new Map(mainRounds.map(match => [match.round + ":" + match.position, match]));
  const thirdPlace = byCoordinate.get(totalRounds + ":1");
  const source = matches.find(match => match.id === sourceId);
  if (!source || source.round <= 0) return { affected: [] as T[], edges: [] as MatchDependency[] };

  const affected: T[] = [];
  const affectedIds = new Set<string>();
  const edges: MatchDependency[] = [];
  const queue = [source];

  while (queue.length) {
    const current = queue.shift()!;
    if (current.round >= totalRounds) continue;
    const slot = current.position % 2 === 0 ? "teamAId" as const : "teamBId" as const;
    const finalPath = byCoordinate.get((current.round + 1) + ":" + Math.floor(current.position / 2));
    const outgoing: MatchDependency[] = [];
    if (finalPath) outgoing.push({ fromId: current.id, toId: finalPath.id, slot, outcome: "winner" });
    if (thirdPlace && current.round === totalRounds - 1) outgoing.push({ fromId: current.id, toId: thirdPlace.id, slot, outcome: "loser" });

    for (const edge of outgoing) {
      edges.push(edge);
      const target = matches.find(match => match.id === edge.toId);
      if (target && !affectedIds.has(target.id)) {
        affectedIds.add(target.id);
        affected.push(target);
        queue.push(target);
      }
    }
  }

  return { affected, edges };
}


export function cascadeCoordinates(round: number, position: number, totalRounds: number) {
  const cascade = [];
  let currentRound = round, currentPosition = position;
  while (currentRound < totalRounds) {
    const next = nextMatchCoordinate(currentRound, currentPosition);
    cascade.push({ round: next.round, position: next.position });
    currentRound = next.round;
    currentPosition = next.position;
  }
  return cascade;
}
