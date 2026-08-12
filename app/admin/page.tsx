"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Team = { id: string; name: string; playerOne?: string; playerTwo?: string };
type Score = { a: string; b: string };

export default function Admin() {
  const [state, setState] = useState<any | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [edition, setEdition] = useState("");
  const [playerOne, setPlayerOne] = useState("");
  const [playerTwo, setPlayerTwo] = useState("");
  const [drawMode, setDrawMode] = useState<"PRELIMINARIES" | "REPECHAGE">("PRELIMINARIES");
  const [authenticated, setAuthenticated] = useState(false);
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [busy, setBusy] = useState("");

  const refresh = async () => {
    try {
      const response = await fetch("/api/state", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "Impossibile collegarsi al database");
      setState(data);
      setLoadError("");
    } catch (error: any) {
      const text = error.message || "Impossibile aggiornare la pagina";
      setMessage(text);
      setLoadError(text);
    }
  };

  useEffect(() => { void refresh(); }, []);

  async function call(url: string, body: any = {}, method = "POST") {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Error(data.error || "Operazione non riuscita");
    return data;
  }

  async function run(label: string, work: () => Promise<void>) {
    try { setBusy(label); setMessage(""); await work(); } catch (error: any) { setMessage(error.message || "Operazione non riuscita"); } finally { setBusy(""); }
  }

  if (state === undefined) return <main className="auth"><div className="authCard"><div className="mark">RB</div><h1>{loadError ? "Connessione non disponibile" : "Caricamento torneo…"}</h1>{loadError && <><p>{loadError}</p><button className="primaryButton" onClick={() => void refresh()}>Riprova</button></>}</div></main>;
  if (state === null) return <Auth title="Crea il torneo" password={password} setPassword={setPassword} name={name} setName={setName} edition={edition} setEdition={setEdition} message={message} submit={() => run("setup", async () => { await call("/api/setup", { name, edition, password }); setAuthenticated(true); await refresh(); })} busy={busy === "setup"} />;
  if (!authenticated) return <Auth title="Area organizzatore" password={password} setPassword={setPassword} message={message} submit={() => run("login", async () => { await call("/api/login", { password }); setAuthenticated(true); })} busy={busy === "login"} />;

  const live = state.matches.filter((match: any) => match.status === "LIVE");
  const waiting = state.matches.filter((match: any) => match.status === "SCHEDULED" && match.a && match.b);
  const statusLabel = state.status === "SETUP" ? "Configurazione" : state.status === "READY" ? "Sorteggio pronto" : state.status === "LIVE" ? "Torneo in corso" : "Torneo concluso";
  const saveSettings = () => run("settings", async () => { await call("/api/setup", { name, edition }, "PATCH"); await refresh(); });
  const addTeam = () => run("team", async () => { await call("/api/teams", { playerOne, playerTwo }); setPlayerOne(""); setPlayerTwo(""); await refresh(); });
  const removeTeam = (id: string) => run(`remove-`, async () => { await call("/api/teams", { id }, "DELETE"); await refresh(); });
  const editTeam = (team: Team) => { const playerOne = window.prompt("Giocatore 1 · nome e cognome", team.playerOne || team.name.split(" / ")[0] || ""); const playerTwo = window.prompt("Giocatore 2 · nome e cognome", team.playerTwo || team.name.split(" / ")[1] || ""); if (playerOne !== null && playerTwo !== null) void run(`edit-`, async () => { await call("/api/teams", { id: team.id, playerOne, playerTwo }, "PATCH"); await refresh(); }); };
  const assignRepechage = (teamId: string, matchId: string) => run(`repechage-`, async () => { await call("/api/draw", { action: "assign", teamId, matchId }, "PATCH"); await refresh(); });
  const finalizeRepechage = () => run("repechage-finalize", async () => { await call("/api/draw", { action: "finalize" }, "PATCH"); await refresh(); });
  const action = (url: string, label: string) => run(label, async () => { await call(url); await refresh(); });
  const saveScore = (match: any) => run(`score-${match.id}`, async () => { const score = scores[match.id] || { a: "", b: "" }; await call("/api/match", { id: match.id, a: score.a, b: score.b }); setScores(current => ({ ...current, [match.id]: { a: "", b: "" } })); await refresh(); });
  const resetTournament = () => { if (window.confirm("Questa operazione annulla tabellone e risultati. Vuoi continuare?")) void run("reset", async () => { await call("/api/draw", { action: "reset" }, "PATCH"); await refresh(); }); };
  const correctScore = (match: any) => { const a = window.prompt(`Punteggio ${match.a}`, String(match.scoreA)); const b = window.prompt(`Punteggio ${match.b}`, String(match.scoreB)); if (a !== null && b !== null) void run(`correct-${match.id}`, async () => { await call("/api/match", { id: match.id, a, b }, "PATCH"); await refresh(); }); };

  return <main className="adminApp"><header className="adminHeader"><div><p className="kicker">Organizzazione</p><h1>{state.name}</h1></div><div className="headerActions"><Link href="/" target="_blank">Apri vista pubblica ↗</Link><button className="textButton" onClick={() => void run("logout", async () => { await call("/api/logout"); setAuthenticated(false); })}>Esci</button></div></header><section className="adminOverview"><div><span className={`statusPill ${state.status.toLowerCase()}`}>{statusLabel}</span><p>{state.edition} · {state.teams} coppie · 2 campi</p></div><div className="adminStats"><span><b>{live.length}</b> in campo</span><span><b>{waiting.length}</b> in attesa</span></div></section>{message && <div className="notice" role="alert">{message}</div>}{state.status === "SETUP" && <Setup state={state} name={name} setName={setName} edition={edition} setEdition={setEdition} playerOne={playerOne} setPlayerOne={setPlayerOne} playerTwo={playerTwo} setPlayerTwo={setPlayerTwo} drawMode={drawMode} setDrawMode={setDrawMode} saveSettings={saveSettings} addTeam={addTeam} removeTeam={removeTeam} editTeam={editTeam} draw={() => run("draw", async () => { await call("/api/draw", { mode: drawMode }); await refresh(); })} busy={busy} />}{state.status === "READY" && <section className="adminPanel actionPanel"><p className="kicker">Pronto per l’avvio</p><h2>Il tabellone è stato generato</h2><p>Controlla le coppie nella vista pubblica. Quando sei pronto, avvia il torneo: i primi due incontri vengono assegnati ai campi.</p><button className="primaryButton" disabled={Boolean(busy)} onClick={() => action("/api/start", "start")}>{busy === "start" ? "Avvio…" : "Avvia torneo"}</button><AdminBracket matches={state.matches} /></section>}{(state.status === "READY" || state.status === "LIVE" || state.status === "FINISHED") && <section className="adminPanel resetPanel"><p className="kicker">Modifiche strutturali</p><h2>Partecipanti e tabellone</h2><p>Per aggiungere o rimuovere coppie, annulla il tabellone attuale e torna alla configurazione. I nomi delle coppie restano sempre modificabili.</p><button className="minorButton" disabled={Boolean(busy)} onClick={resetTournament}>{busy === "reset" ? "Annullamento…" : "Modifica partecipanti e rigenera"}</button></section>} {state.status === "LIVE" && state.repechage?.slots?.length > 0 && <Repechage panel={state.repechage} assign={assignRepechage} finalize={finalizeRepechage} busy={busy} />} {(state.status === "LIVE" || state.status === "FINISHED") && <><section className="adminPanel"><div className="sectionHeading"><div><p className="kicker">Regia campi</p><h2>{state.status === "FINISHED" ? "Risultati finali" : "Incontri da gestire"}</h2></div><span className="muted">Vincitore: 11–14 punti, pareggi vietati</span></div><div className="adminMatchGrid">{live.map((match: any) => <ControlMatch key={match.id} match={match} score={scores[match.id] || { a: "", b: "" }} setScore={(score: Score) => setScores(current => ({ ...current, [match.id]: score }))} save={() => saveScore(match)} busy={busy === `score-${match.id}`} />)}{!live.length && state.status === "LIVE" && <div className="emptyState">Nessun incontro attivo: i prossimi verranno assegnati automaticamente.</div>}{state.status === "FINISHED" && state.matches.filter((match: any) => match.status === "FINISHED").map((match: any) => <ControlMatch key={match.id} match={match} score={{ a: "", b: "" }} setScore={() => {}} save={() => {}} busy={false} />)}</div></section><section className="adminPanel"><div className="sectionHeading"><div><p className="kicker">Tabellone operativo</p><h2>Avanzamento</h2></div></div><AdminBracket matches={state.matches} />{state.status === "LIVE" && <div className="completedControls">{state.matches.filter((match: any) => match.status === "FINISHED" && match.a && match.b).map((match: any) => <button key={match.id} className="minorButton" disabled={Boolean(busy)} onClick={() => correctScore(match)}>Correggi {match.a} – {match.b}</button>)}</div>}</section></>}</main>;
}

function Setup({ state, name, setName, edition, setEdition, playerOne, setPlayerOne, playerTwo, setPlayerTwo, drawMode, setDrawMode, saveSettings, addTeam, removeTeam, editTeam, draw, busy }: any) {
  return <>
    <section className="adminPanel"><div className="sectionHeading"><div><p className="kicker">Dettagli</p><h2>Imposta il torneo</h2></div></div><div className="formGrid"><label>Nome torneo<input value={name || state.name} onChange={event => setName(event.target.value)} /></label><label>Edizione<input value={edition || state.edition} onChange={event => setEdition(event.target.value)} /></label><button className="minorButton" disabled={Boolean(busy)} onClick={saveSettings}>Salva dettagli</button></div></section>
    <section className="adminPanel"><div className="sectionHeading"><div><p className="kicker">Coppie</p><h2>Iscrizioni <span className="countBadge">{state.teams}</span></h2></div><span className="muted">Nome e cognome di entrambi i giocatori</span></div><div className="pairEntry"><input placeholder="Giocatore 1 · nome e cognome" value={playerOne} onChange={event => setPlayerOne(event.target.value)} /><input placeholder="Giocatore 2 · nome e cognome" value={playerTwo} onChange={event => setPlayerTwo(event.target.value)} /><button className="primaryButton" disabled={!playerOne.trim() || !playerTwo.trim() || Boolean(busy)} onClick={addTeam}>Aggiungi coppia</button></div><div className="teamRoster">{state.teamList.map((item: Team, index: number) => <div key={item.id} className="rosterRow"><span className="seed">{String(index + 1).padStart(2, "0")}</span><b>{item.name}</b><button className="iconButton" aria-label={`Rimuovi `} disabled={Boolean(busy)} onClick={() => removeTeam(item.id)}>×</button></div>)}</div><div className="drawModes"><label><input type="radio" checked={drawMode === "PRELIMINARIES"} onChange={() => setDrawMode("PRELIMINARIES")} /> Preliminari <small>I bye avanzano automaticamente.</small></label><label><input type="radio" checked={drawMode === "REPECHAGE"} onChange={() => setDrawMode("REPECHAGE")} /> Ripescaggi <small>Scegli manualmente le migliori sconfitte.</small></label></div><button className="primaryButton drawButton" disabled={state.teams < 2 || Boolean(busy)} onClick={draw}>Rigenera tabellone ({drawMode === "REPECHAGE" ? "ripescaggi" : "preliminari"})</button></section>
  </>;
}

function Repechage({ panel, assign, finalize, busy }: any) { return <section className="adminPanel repechagePanel"><div className="sectionHeading"><div><p className="kicker">Ripescaggi</p><h2>Scegli le migliori coppie sconfitte</h2></div><span className="muted">Ordinate per differenza punti, poi punti segnati</span></div><div className="repechageGrid">{panel.candidates.map((team: any, index: number) => <div className="repechageTeam" key={team.id}><span>#{index + 1}</span><b>{team.name}</b><small>{team.scored}–{team.conceded} · diff. {team.difference > 0 ? "+" : ""}{team.difference}</small><select defaultValue="" disabled={Boolean(busy)} onChange={event => { if (event.target.value) assign(team.id, event.target.value); }}><option value="">Assegna a…</option>{panel.slots.map((slot: any) => <option value={slot.id} key={slot.id}>contro {slot.opponent}</option>)}</select></div>)}</div><button className="primaryButton" disabled={Boolean(busy)} onClick={finalize}>Chiudi ripescaggi e continua</button></section>; }

function ControlMatch({ match, score, setScore, save, busy }: any) { const active = match.status === "LIVE"; return <article className={`controlMatch ${active ? "active" : ""}`}><header><span>{active ? `Campo ${match.field}` : "Conclusa"}</span>{active && <i className="liveDot">Live</i>}</header><div className="controlTeams"><b>{match.a}</b><strong>{match.scoreA} — {match.scoreB}</strong><b>{match.b}</b></div>{active && <div className="scoreEntry"><input aria-label={`Punteggio ${match.a}`} inputMode="numeric" type="number" min="0" max="14" placeholder="0" value={score.a} onChange={(event: any) => setScore({ ...score, a: event.target.value })} /><span>–</span><input aria-label={`Punteggio ${match.b}`} inputMode="numeric" type="number" min="0" max="14" placeholder="0" value={score.b} onChange={(event: any) => setScore({ ...score, b: event.target.value })} /><button className="primaryButton" disabled={busy} onClick={save}>{busy ? "Salvo…" : "Conferma risultato"}</button></div>}</article>; }

function adminRoundName(round: number, total: number) { const remaining = 2 ** (total - round + 1); return remaining === 64 ? "32-esimi" : remaining === 32 ? "16-esimi" : remaining === 16 ? "Ottavi" : remaining === 8 ? "Quarti" : remaining === 4 ? "Semifinali" : "Finale"; }

function AdminBracket({ matches }: { matches: any[] }) { const rounds = [...new Set(matches.map(match => match.round))].sort((a: number, b: number) => a - b); return <div className="bracketScroll"><div className="bracket adminBracket">{rounds.map((round: any) => <div className="bracketRound" key={round}><div className="roundLabel"><span>{adminRoundName(round, rounds.length)}</span></div><div className="roundMatches">{matches.filter(match => match.round === round).map(match => <div className={`miniMatch ${match.status.toLowerCase()}`} key={match.id}><span>{match.a || "Da definire"}<b>{match.status === "SCHEDULED" ? "–" : match.scoreA}</b></span><span>{match.b || "Da definire"}<b>{match.status === "SCHEDULED" ? "–" : match.scoreB}</b></span></div>)}</div></div>)}</div></div>; }

function Auth({ title, password, setPassword, name, setName, edition, setEdition, message, submit, busy }: any) { const creating = title === "Crea il torneo"; return <main className="auth"><form className="authCard" onSubmit={event => { event.preventDefault(); void submit(); }}><div className="mark">RB</div><p className="kicker">RAPONE BOCCE</p><h1>{title}</h1><p>{creating ? "Dai un’identità al torneo, poi potrai comporre il tabellone." : "Inserisci la password amministratore per gestire il torneo."}</p>{creating && <><input placeholder="Nome torneo" value={name} onChange={event => setName(event.target.value)} /><input placeholder="Edizione (es. 51ª Edizione)" value={edition} onChange={event => setEdition(event.target.value)} /></>}<input autoFocus type="password" minLength={creating ? 10 : 1} placeholder="Password amministratore" value={password} onChange={event => setPassword(event.target.value)} required /><button className="primaryButton" disabled={busy}>{busy ? "Attendi…" : title}</button>{message && <div className="notice">{message}</div>}<Link href="/">Vai alla vista pubblica</Link></form></main>; }
