"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MAX_SCORE, MIN_WINNING_SCORE } from "../../../../lib/bracket";

function localInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function roundName(round: number, total: number) {
  if (round === 0) return "Spareggi";
  const remaining = 2 ** (total - round + 1);
  return remaining === 64 ? "32-esimi" : remaining === 32 ? "16-esimi" : remaining === 16 ? "Ottavi" : remaining === 8 ? "Quarti" : remaining === 4 ? "Semifinali" : "Finali";
}

export default function HistoricalAdmin({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState(""), [state, setState] = useState<any>(null), [editions, setEditions] = useState<any>(null), [loading, setLoading] = useState(true), [error, setError] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [team, setTeam] = useState<any>(null), [match, setMatch] = useState<any>(null), [scheduledAt, setScheduledAt] = useState("");

  const load = async (editionId: string) => {
    setLoading(true); setError("");
    try {
      const [editionResponse, listResponse] = await Promise.all([
        fetch("/api/admin/editions/" + editionId, { cache: "no-store" }),
        fetch("/api/admin/editions", { cache: "no-store" }),
      ]);
      const edition = await editionResponse.json(), list = await listResponse.json();
      if (!editionResponse.ok) throw Error(edition.error || "Edizione non disponibile");
      if (!listResponse.ok) throw Error(list.error || "Elenco edizioni non disponibile");
      if (!edition.historical) { window.location.href = "/admin"; return; }
      setState(edition); setEditions(list); setScheduledAt(localInput(edition.scheduledAt));
    } catch (reason: any) { setError(reason.message || "Edizione non disponibile"); } finally { setLoading(false); }
  };

  useEffect(() => { void params.then(value => { setId(value.id); return load(value.id); }); }, [params]);

  const call = async (url: string, body: any) => {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json(); if (!response.ok) throw Error(value.error || "Operazione non riuscita");
      await load(id); setMessage("Correzione salvata."); return true;
    } catch (reason: any) { setError(reason.message || "Operazione non riuscita"); return false; } finally { setBusy(false); }
  };

  const totalRounds = useMemo(() => Math.max(0, ...(state?.matches ?? []).map((item: any) => item.round)), [state]);

  if (loading) return <main className="auth"><div className="authCard"><div className="mark">RB</div><h1>Caricamento archivio…</h1></div></main>;
  if (!state) return <main className="auth"><div className="authCard"><div className="mark">RB</div><h1>Accesso richiesto</h1><p>{error}</p><Link className="primaryButton" href="/admin">Accedi all’area admin</Link></div></main>;

  return <main className="adminApp historicalAdmin">
    {error && <div className="operationToast" role="alert"><div><b>Operazione non riuscita</b><span>{error}</span></div><button onClick={() => setError("")}>×</button></div>}
    <header className="adminHeader"><div><p className="kicker">Archivio organizzatore</p><h1>{state.edition}</h1></div><div className="headerActions"><Link href={"/archivio/" + state.editionNumber} target="_blank">Vista pubblica ↗</Link><Link href="/admin">Edizione corrente</Link><button className="textButton" onClick={() => void fetch("/api/logout", { method: "POST" }).finally(() => { window.location.href = "/admin"; })}>Esci</button></div></header>
    <section className="editionToolbar"><label>Edizione<select value={id} onChange={event => { const value = event.target.value; window.location.href = value === editions.currentId ? "/admin" : "/admin/archivio/" + value; }}>{editions.editions.map((item: any) => <option key={item.id} value={item.id}>{item.edition}{item.isCurrent ? " · corrente" : " · archivio"}</option>)}</select></label><a className="minorButton" href={"/api/archive/" + state.editionNumber + "/export"}>Scarica JSON pubblico</a></section>
    {message && <div className="notice">{message}</div>}
    <section className="adminPanel historicalPolicy"><p className="kicker">Edizione archiviata</p><h2>Correzioni sicure</h2><p>Puoi correggere data, nominativi e punteggi soltanto mantenendo invariati vincitori, tabellone e ripescaggi. Reset, stati e struttura restano bloccati.</p></section>
    <section className="adminPanel"><div className="sectionHeading"><h2>Data ufficiale</h2></div><div className="historicalDate"><input type="datetime-local" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /><button className="primaryButton" disabled={busy || !scheduledAt} onClick={() => void call("/api/admin/editions/" + id, { scheduledAt: new Date(scheduledAt).toISOString() })}>Salva data</button></div></section>
    <section className="adminPanel"><div className="sectionHeading"><h2>Coppie</h2><span className="muted">{state.teams}</span></div><div className="teamRoster">{state.teamList.map((item: any, index: number) => <div className="rosterRow" key={item.id}><span className="seed">{String(index + 1).padStart(2, "0")}</span><div className="rosterNames"><b>{item.playerOne || item.name}</b>{item.playerTwo && <span>{item.playerTwo}</span>}</div><div className="rosterActions historicalAction"><button className="minorButton" onClick={() => setTeam({ ...item })}>Modifica</button></div></div>)}</div></section>
    <section className="adminPanel"><div className="sectionHeading"><h2>Risultati</h2><span className="muted">{state.matches.filter((item: any) => item.status === "FINISHED" && item.a && item.b).length}</span></div><div className="completedList">{state.matches.filter((item: any) => item.status === "FINISHED" && item.a && item.b).map((item: any) => <button className="completedRow" key={item.id} onClick={() => setMatch({ ...item, aScore: String(item.scoreA), bScore: String(item.scoreB) })}><span>{item.a} <b>{item.scoreA} – {item.scoreB}</b> {item.b}</span><small>{roundName(item.round, totalRounds)} · Correggi</small></button>)}</div></section>
    {team && <div className="modalBackdrop"><form className="modalCard" onSubmit={event => { event.preventDefault(); void call("/api/admin/editions/" + id + "/teams", { id: team.id, playerOne: team.playerOne, playerTwo: team.playerTwo }).then(ok => { if (ok) setTeam(null); }); }}><p className="kicker">Storico</p><h2>Correggi nominativi</h2><label>Giocatore 1<input required value={team.playerOne || ""} onChange={event => setTeam({ ...team, playerOne: event.target.value })} /></label><label>Giocatore 2<input required value={team.playerTwo || ""} onChange={event => setTeam({ ...team, playerTwo: event.target.value })} /></label><div className="modalActions"><button type="button" className="textButton" onClick={() => setTeam(null)}>Annulla</button><button className="primaryButton" disabled={busy}>Salva</button></div></form></div>}
    {match && <div className="modalBackdrop"><form className="modalCard" onSubmit={event => { event.preventDefault(); void call("/api/admin/editions/" + id + "/matches", { id: match.id, a: Number(match.aScore), b: Number(match.bScore) }).then(ok => { if (ok) setMatch(null); }); }}><p className="kicker">Correzione storica · {roundName(match.round, totalRounds)}</p><h2>{match.a} – {match.b}</h2><p className="muted">Il vincitore deve restare {match.winner}. Valori validi: vincitore da {MIN_WINNING_SCORE} a {MAX_SCORE}, nessun pareggio.</p><div className="modalScore"><input type="number" min="0" max={MAX_SCORE} value={match.aScore} onChange={event => setMatch({ ...match, aScore: event.target.value })} /><span>–</span><input type="number" min="0" max={MAX_SCORE} value={match.bScore} onChange={event => setMatch({ ...match, bScore: event.target.value })} /></div><div className="modalActions"><button type="button" className="textButton" onClick={() => setMatch(null)}>Annulla</button><button className="primaryButton" disabled={busy}>Salva correzione</button></div></form></div>}
  </main>;
}
