import assert from "node:assert/strict";
import test from "node:test";
import { assertBocceScore, bracketSize, cascadeCoordinates, firstRoundSlots, MAX_CONCURRENT_MATCHES, MAX_SCORE, MAX_TEAMS, MIN_WINNING_SCORE, nextMatchCoordinate, lateEntryPlans, matchDependencyGraph, repechageCutoff, repechagePlan, repechagePlayoffWave, shuffleItems, tournamentEstimate } from "../lib/bracket.ts";

test("every supported team count creates a traversable first round", () => {
  for (let count = 2; count <= MAX_TEAMS; count++) {
    const teams = Array.from({ length: count }, (_, index) => index + 1);
    const size = bracketSize(count), slots = firstRoundSlots(teams);
    assert.equal(slots.length, size);
    assert.equal(new Set(slots.filter(Boolean)).size, count);
    assert.equal(slots.filter(slot => slot === null).length, size - count);
    for (let index = 0; index < slots.length; index += 2) assert.ok(slots[index] || slots[index + 1], count + " teams: empty first-round match");
  }
});

test("invalid team counts and bocce scores are rejected", () => {
  for (const count of [0, 1, MAX_TEAMS + 1, 3.5]) assert.throws(() => bracketSize(count));
  for (const score of [[11, 0], [12, 12], [15, 2], [-1, 12], [12.5, 2]]) assert.throws(() => assertBocceScore(score[0], score[1]));
  assert.doesNotThrow(() => assertBocceScore(12, 0));
  assert.doesNotThrow(() => assertBocceScore(14, 13));
  assert.equal(MIN_WINNING_SCORE, 12);
  assert.equal(MAX_SCORE, 14);
});

test("at most two matches can run concurrently", () => {
  assert.equal(MAX_CONCURRENT_MATCHES, 2);
});

test("next slots remain deterministic", () => {
  assert.deepEqual(nextMatchCoordinate(1, 0), { round: 2, position: 0, slot: "a" });
  assert.deepEqual(nextMatchCoordinate(1, 1), { round: 2, position: 0, slot: "b" });
});


test("repechage plans select exactly the pairs needed to complete each bracket", () => {
  assert.deepEqual(repechagePlan(10), { size: 16, preliminaryMatches: 2, byeSlots: 6, selections: 2 });
  assert.deepEqual(repechagePlan(13), { size: 16, preliminaryMatches: 5, byeSlots: 3, selections: 3 });
  assert.deepEqual(repechagePlan(7), { size: 8, preliminaryMatches: 3, byeSlots: 1, selections: 1 });
  assert.deepEqual(repechagePlan(16), { size: 16, preliminaryMatches: 8, byeSlots: 0, selections: 0 });
});

test("format estimates explain preliminary and repechage match counts", () => {
  assert.deepEqual(tournamentEstimate(10), { size: 16, preliminaryMatches: 2, byeSlots: 6, selections: 2, rounds: 4, thirdPlaceMatches: 1, directMatches: 10, repechageMatches: 12, maxTieBreakMatches: 0, repechageMaxMatches: 12 });
  assert.deepEqual(tournamentEstimate(13), { size: 16, preliminaryMatches: 5, byeSlots: 3, selections: 3, rounds: 4, thirdPlaceMatches: 1, directMatches: 13, repechageMatches: 16, maxTieBreakMatches: 2, repechageMaxMatches: 18 });
  assert.equal(tournamentEstimate(3).directMatches, 2);
  assert.equal(tournamentEstimate(3).repechageMatches, 3);
  for (let count = 2; count <= MAX_TEAMS; count++) {
    const estimate = tournamentEstimate(count);
    assert.ok(estimate.repechageMatches >= estimate.directMatches);
    assert.ok(estimate.repechageMaxMatches >= estimate.repechageMatches);
  }
});

test("draw shuffle keeps every pair and changes their order with a supplied random source", () => {
  const teams = ["A", "B", "C", "D", "E"];
  const shuffled = shuffleItems(teams, () => 0);
  assert.deepEqual(teams, ["A", "B", "C", "D", "E"]);
  assert.deepEqual([...shuffled].sort(), teams);
  assert.notDeepEqual(shuffled, teams);
});


test("a result correction identifies only the dependent branch", () => {
  assert.deepEqual(cascadeCoordinates(1, 0, 4), [{ round: 2, position: 0 }, { round: 3, position: 0 }, { round: 4, position: 0 }]);
  assert.deepEqual(cascadeCoordinates(2, 3, 4), [{ round: 3, position: 1 }, { round: 4, position: 0 }]);
});


test("automatic repechage resolves clear rankings and cutoff ties", () => {
  const candidates = [
    { id: "A", difference: -1, scored: 10 },
    { id: "B", difference: -2, scored: 9 },
    { id: "C", difference: -2, scored: 9 },
    { id: "D", difference: -4, scored: 7 }
  ];
  const tied = repechageCutoff(candidates, 2);
  assert.deepEqual(tied.guaranteed.map(item => item.id), ["A"]);
  assert.deepEqual(tied.tied.map(item => item.id), ["B", "C"]);
  assert.equal(tied.remaining, 1);
  assert.equal(tied.needsPlayoff, true);
  const clear = repechageCutoff(candidates, 3);
  assert.deepEqual(clear.guaranteed.map(item => item.id), ["A"]);
  assert.deepEqual(clear.tied.map(item => item.id), ["B", "C"]);
  assert.equal(clear.remaining, 2);
  assert.equal(clear.needsPlayoff, false);
});

test("playoff waves handle multiple tied pairs, byes and multiple available places", () => {
  assert.deepEqual(repechagePlayoffWave(["A", "B"], 1, () => .999), [["A", "B"]]);
  assert.equal(repechagePlayoffWave(["A", "B", "C"], 2, () => .999).length, 1);
  assert.equal(repechagePlayoffWave(["A", "B", "C", "D", "E"], 2, () => .999).length, 2);
  assert.throws(() => repechagePlayoffWave(["A", "B"], 2));
});


test("automatic playoff waves always converge for every supported tie size", () => {
  for (let tied = 2; tied <= MAX_TEAMS; tied++) {
    for (let places = 1; places < tied; places++) {
      let survivors = Array.from({ length: tied }, (_, index) => "T" + index);
      let waves = 0;
      while (survivors.length > places) {
        const pairs = repechagePlayoffWave(survivors, places, () => .999);
        assert.ok(pairs.length > 0);
        const eliminated = new Set(pairs.map(pair => pair[1]));
        survivors = survivors.filter(team => !eliminated.has(team));
        assert.ok(++waves <= MAX_TEAMS);
      }
      assert.equal(survivors.length, places);
    }
  }
});

test("cutoff validation covers zero selections, complete ties and invalid requests", () => {
  const tied = Array.from({ length: 8 }, (_, index) => ({ id: "T" + index, difference: -3, scored: 8 }));
  assert.equal(repechageCutoff(tied, 0).needsPlayoff, false);
  for (let places = 1; places < tied.length; places++) {
    const cutoff = repechageCutoff(tied, places);
    assert.equal(cutoff.guaranteed.length, 0);
    assert.equal(cutoff.tied.length, tied.length);
    assert.equal(cutoff.remaining, places);
    assert.equal(cutoff.needsPlayoff, true);
  }
  assert.throws(() => repechageCutoff(tied, -1));
  assert.throws(() => repechageCutoff(tied, tied.length + 1));
});


test("late entries use only branches without played dependent matches", () => {
  const safe = lateEntryPlans([
    { id: "first", round: 1, position: 0, teamAId: "A", teamBId: null, winnerId: "A", status: "FINISHED" },
    { id: "second", round: 2, position: 0, teamAId: "A", teamBId: "B", winnerId: null, status: "READY" },
    { id: "final", round: 3, position: 0, teamAId: null, teamBId: null, winnerId: null, status: "SCHEDULED" }
  ]);
  assert.equal(safe.length, 1);
  assert.equal(safe[0].matchId, "first");
  assert.equal(safe[0].openSlot, "teamBId");
  assert.deepEqual(safe[0].resetMatchIds, ["first", "second"]);
  assert.deepEqual(safe[0].clearSlots, [{ matchId: "second", slot: "teamAId" }]);

  const live = [
    { id: "first", round: 1, position: 0, teamAId: "A", teamBId: null, winnerId: "A", status: "FINISHED" },
    { id: "second", round: 2, position: 0, teamAId: "A", teamBId: "B", winnerId: null, status: "LIVE" }
  ];
  assert.deepEqual(lateEntryPlans(live), []);
  assert.deepEqual(lateEntryPlans([{ ...live[0] }, { ...live[1], status: "FINISHED", winnerId: "B" }]), []);
});

test("late entries safely reopen chains made only of automatic byes", () => {
  const plans = lateEntryPlans([
    { id: "r1", round: 1, position: 0, teamAId: "A", teamBId: null, winnerId: "A", status: "FINISHED" },
    { id: "r2", round: 2, position: 0, teamAId: "A", teamBId: null, winnerId: "A", status: "FINISHED" },
    { id: "r3", round: 3, position: 0, teamAId: "A", teamBId: "C", winnerId: null, status: "WAITING" }
  ]);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0].resetMatchIds, ["r1", "r2", "r3"]);
  assert.deepEqual(plans[0].clearSlots, [
    { matchId: "r2", slot: "teamAId" },
    { matchId: "r3", slot: "teamAId" }
  ]);
  assert.deepEqual(lateEntryPlans([{ id: "open", round: 1, position: 2, teamAId: null, teamBId: "D", winnerId: null, status: "SCHEDULED" }])[0], {
    matchId: "open", openSlot: "teamAId", opponentId: "D", resetMatchIds: ["open"], clearSlots: []
  });
});


test("semifinals feed winners to the final and losers to the third-place match", () => {
  const matches = [
    { id: "quarter", round: 1, position: 0 },
    { id: "semi-a", round: 2, position: 0 },
    { id: "semi-b", round: 2, position: 1 },
    { id: "final", round: 3, position: 0 },
    { id: "third", round: 3, position: 1 }
  ];
  const semifinal = matchDependencyGraph(matches, "semi-a");
  assert.deepEqual(semifinal.affected.map(match => match.id), ["final", "third"]);
  assert.deepEqual(semifinal.edges, [
    { fromId: "semi-a", toId: "final", slot: "teamAId", outcome: "winner" },
    { fromId: "semi-a", toId: "third", slot: "teamAId", outcome: "loser" }
  ]);
  const quarter = matchDependencyGraph(matches, "quarter");
  assert.deepEqual(quarter.affected.map(match => match.id), ["semi-a", "final", "third"]);
  assert.equal(quarter.edges.filter(edge => edge.toId === "third").length, 1);
});
