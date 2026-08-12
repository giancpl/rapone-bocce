export const MAX_TEAMS = 64;

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
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 14 || b > 14 || a === b || Math.max(a, b) < 11) throw Error("Il vincitore deve avere da 11 a 14 punti; pareggi non ammessi");
}
