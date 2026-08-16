import assert from "node:assert/strict";
import test from "node:test";
import { archiveEtag, sportingExport } from "../lib/archive-data.ts";

const team = (id, playerOne, playerTwo, updatedAt = "2026-08-14T12:00:00.000Z") => ({ id, name: playerOne + " / " + playerTwo, playerOne, playerTwo, paidAt: "PRIVATE", updatedAt });
const a = team("internal-a", "Anna Rossi", "Luca Bianchi");
const b = team("internal-b", "Marta Verdi", "Paolo Neri");
const c = team("internal-c", "Sara Blu", "Enzo Gialli");
const d = team("internal-d", "Ivo Viola", "Lea Rosa");
const match = (id, position, teamA, teamB, winner, scoreA, scoreB) => ({ id, round: 2, position, status: "FINISHED", teamA, teamB, teamAId: teamA.id, teamBId: teamB.id, winner, winnerId: winner.id, scoreA, scoreB, startedAt: null, finishedAt: "2026-08-14T11:00:00.000Z", updatedAt: "2026-08-14T11:00:00.000Z" });
const tournament = {
  id: "internal-tournament", name: "Torneo di Bocce", edition: "51° edizione", editionNumber: 51,
  scheduledAt: "2026-08-13T14:00:00.000Z", status: "FINISHED", drawMode: "REPECHAGE",
  startedAt: "2026-08-13T14:00:00.000Z", finishedAt: "2026-08-14T12:00:00.000Z", updatedAt: "2026-08-14T12:00:00.000Z",
  adminPasswordHash: "PRIVATE_HASH", registrations: [{ playerOne: "PRIVATE" }], sessions: [{ tokenHash: "PRIVATE_TOKEN" }],
  teams: [a, b, c, d], matches: [match("internal-final", 0, a, b, a, 12, 8), match("internal-third", 1, c, d, d, 10, 12)],
};

test("public sporting JSON contains podium and no internal or administrative data", () => {
  const value = sportingExport(tournament);
  assert.deepEqual(value.summary.podium, [{ place: 1, team: "Anna Rossi / Luca Bianchi" }, { place: 2, team: "Marta Verdi / Paolo Neri" }, { place: 3, team: "Ivo Viola / Lea Rosa" }]);
  assert.equal(value.schemaVersion, 1);
  assert.equal(value.matches[0].winner, "Anna Rossi / Luca Bianchi");
  const json = JSON.stringify(value);
  for (const privateValue of ["internal-", "PRIVATE", "paidAt", "adminPasswordHash", "registrations", "sessions", "tokenHash", "tournamentId"]) assert.equal(json.includes(privateValue), false, privateValue);
});

test("archive ETag is stable and changes after a sporting update", () => {
  assert.equal(archiveEtag(tournament), archiveEtag(structuredClone(tournament)));
  const changed = structuredClone(tournament);
  changed.matches[0].updatedAt = "2026-08-14T13:00:00.000Z";
  assert.notEqual(archiveEtag(tournament), archiveEtag(changed));
  assert.equal(sportingExport(tournament).exportedAt, "2026-08-14T12:00:00.000Z");
});
