import { createHash } from "node:crypto";

const displayName = (team: { name: string; playerOne?: string | null; playerTwo?: string | null }) =>
  team.playerOne && team.playerTwo ? `${team.playerOne} / ${team.playerTwo}` : team.name;

export function podiumFromTournament(tournament: any) {
  const totalRounds = Math.max(0, ...tournament.matches.map((match: any) => match.round));
  const final = tournament.matches.find((match: any) => match.round === totalRounds && match.position === 0 && match.status === "FINISHED");
  const third = tournament.matches.find((match: any) => match.round === totalRounds && match.position === 1 && match.status === "FINISHED");
  const runnerUp = final?.winnerId === final?.teamAId ? final?.teamB : final?.teamA;
  return [
    final?.winner ? { place: 1, team: displayName(final.winner) } : null,
    runnerUp ? { place: 2, team: displayName(runnerUp) } : null,
    third?.winner ? { place: 3, team: displayName(third.winner) } : null,
  ].filter(Boolean);
}

function roundName(round: number, total: number) {
  if (round === 0) return "Spareggi";
  const remaining = 2 ** (total - round + 1);
  return remaining === 64 ? "32-esimi" : remaining === 32 ? "16-esimi" : remaining === 16 ? "Ottavi" : remaining === 8 ? "Quarti" : remaining === 4 ? "Semifinali" : "Finali";
}

export function archiveUpdatedAt(tournament: any) {
  const timestamps = [tournament.updatedAt, ...tournament.teams.map((team: any) => team.updatedAt), ...tournament.matches.map((match: any) => match.updatedAt)]
    .filter(Boolean).map((value: Date | string) => new Date(value).getTime());
  return new Date(Math.max(0, ...timestamps));
}

export function sportingExport(tournament: any, exportedAt = archiveUpdatedAt(tournament)) {
  const totalRounds = Math.max(0, ...tournament.matches.map((match: any) => match.round));
  return {
    schemaVersion: 1, exportedAt: exportedAt.toISOString(),
    tournament: {
      name: tournament.name, edition: tournament.edition, editionNumber: tournament.editionNumber,
      scheduledAt: tournament.scheduledAt ? new Date(tournament.scheduledAt).toISOString() : null,
      status: tournament.status, formula: tournament.drawMode,
      startedAt: tournament.startedAt ? new Date(tournament.startedAt).toISOString() : null,
      finishedAt: tournament.finishedAt ? new Date(tournament.finishedAt).toISOString() : null,
    },
    summary: { teams: tournament.teams.length, matches: tournament.matches.length, podium: podiumFromTournament(tournament) },
    teams: tournament.teams.map((team: any) => ({ name: displayName(team), players: [team.playerOne, team.playerTwo].filter(Boolean) })),
    rounds: [...new Set<number>(tournament.matches.map((match: any) => match.round))].sort((a, b) => a - b).map(round => ({ round, label: roundName(round, totalRounds) })),
    matches: tournament.matches.map((match: any) => ({
      round: match.round, roundLabel: roundName(match.round, totalRounds), position: match.position, status: match.status,
      teamA: match.teamA ? displayName(match.teamA) : null, teamB: match.teamB ? displayName(match.teamB) : null,
      scoreA: match.status === "FINISHED" && match.teamA && match.teamB ? match.scoreA : null,
      scoreB: match.status === "FINISHED" && match.teamA && match.teamB ? match.scoreB : null,
      winner: match.winner ? displayName(match.winner) : null,
      automatic: match.status === "FINISHED" && Boolean(match.teamA) !== Boolean(match.teamB),
      startedAt: match.startedAt ? new Date(match.startedAt).toISOString() : null,
      finishedAt: match.finishedAt ? new Date(match.finishedAt).toISOString() : null,
    })),
  };
}

export function archiveEtag(tournament: any) {
  return `"${createHash("sha256").update(`${tournament.editionNumber}:${archiveUpdatedAt(tournament).getTime()}`).digest("hex")}"`;
}
