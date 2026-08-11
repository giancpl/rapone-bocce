import { getTournament, publicTournament } from "./tournament-v2";

export async function pub() {
  try { return publicTournament(await getTournament()); } catch { return null; }
}
