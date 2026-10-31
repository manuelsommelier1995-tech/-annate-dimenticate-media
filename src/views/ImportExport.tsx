import { useRef, useState } from "react";
import { useApp } from "../state";
import { Card } from "../components";
import { importMotraFile } from "../importers/motra";
import type { WorkerOut } from "../importers/appleHealth.worker";
import { addDays, dayKey, download, fmtNum, mergeWorkouts, todayKey, weekStart } from "../lib/util";
import { backupJson, filterRange, healthCsv, reportHtml, setsCsv, workoutsCsv, workoutsIcs } from "../lib/exporters";
import { demoData } from "../lib/demo";
import { clearData } from "../lib/store";
import type { AppData, DailyMetrics, Workout } from "../types";

export const CLAUDE_MOTRA_PROMPT = `Usa il connettore Motra per esportare i miei allenamenti degli ultimi 90 giorni.
Per ogni allenamento (motra_query_workouts, poi motra_get_workout_details) crea un file JSON scaricabile "motra-export.json" con questo formato:
{
  "workouts": [
    {
      "id": "<workoutID>",
      "source": "motra",
      "name": "<nome>",
      "start": "YYYY-MM-DDTHH:MM:SS",
      "durationMin": 43,
      "calories": 177,
      "muscleGroups": ["glutes", "hamstrings"],
      "exercises": [
        { "id": "<exerciseId>", "name": "<nome esercizio>", "note": "<nota opzionale>",
          "sets": [ { "reps": 8, "weight": 60, "restSec": 104, "warmup": false, "rpe": 8 } ] }
      ]
    }
  ]
}
Regole: weight in kg (ometti per corpo libero), restSec in secondi, timeSec/distanceM per esercizi a tempo/distanza.`;

function mergeDaily(a: Record<string, DailyMetrics>, b: Record<string, DailyMetrics>) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = { ...out[k], ...v };
  return out;
}

export function ImportExportView() {
  const { data, update } = useApp();
  const [appleState, setAppleState] = useState<{ pct: number; records: number; msg: string } | null>(null);
  const [since, setSince] = useState("730");
  const [motraMsg, setMotraMsg] = useState("");
  const [paste, setPaste] = useState("");
  const [from, setFrom] = useState(addDays(todayKey(), -90));
  const [to, setTo] = useState(todayKey());
  const [copied, setCopied] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const applyImport = (workouts: Workout[], daily: Record<string, DailyMetrics>, label: string) => {
    update((d) => ({ ...d, workouts: mergeWorkouts(d.workouts, workouts), daily: mergeDaily(d.daily, daily), lastImport: `${label} · ${new Date().toLocaleString("it-IT")}` }));
  };

  const importApple = (file: File) => {
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../importers/appleHealth.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    setAppleState({ pct: 0, records: 0, msg: "Lettura in corso…" });
    worker.onmessage = (ev: MessageEvent<WorkerOut>) => {
      const m = ev.data;
      if (m.type === "progress") setAppleState({ pct: (m.read / m.total) * 100, records: m.records, msg: "Lettura in corso…" });
      else if (m.type === "error") { setAppleState({ pct: 0, records: 0, msg: `Errore: ${m.message}` }); worker.terminate(); }
      else {
        const cut = since === "all" ? "" : addDays(todayKey(), -Number(since));
        const daily = Object.fromEntries(Object.entries(m.result.daily).filter(([d]) => d >= cut));
        const workouts = m.result.workouts.filter((w) => dayKey(w.start) >= cut);
        applyImport(workouts, daily, "Apple Salute");
        setAppleState({ pct: 100, records: m.result.records, msg: `Fatto: ${Object.keys(daily).length} giorni di metriche e ${workouts.length} attività importate (${fmtNum(m.result.records)} campioni letti).` });
        worker.terminate();
      }
    };
    worker.postMessage({ file });
  };

  const importMotra = async (text: string, name: string) => {
    try {
      const r = importMotraFile(text, name);
      if (!r.workouts.length && !Object.keys(r.daily).length) throw new Error("Nessun allenamento riconosciuto nel file.");
      applyImport(r.workouts, r.daily, "Motra");
      setMotraMsg(`Importati ${r.workouts.length} allenamenti${Object.keys(r.daily).length ? ` e ${Object.keys(r.daily).length} giorni di metriche` : ""}.`);
      setPaste("");
    } catch (e) {
      setMotraMsg(`Errore: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const restore = async (file: File) => {
    try {
      const j = JSON.parse(await file.text()) as Partial<AppData>;
      if (!Array.isArray(j.workouts)) throw new Error("Non è un backup valido");
      update((d) => ({
        ...d,
        workouts: mergeWorkouts(d.workouts, j.workouts!),
        daily: mergeDaily(d.daily, j.daily ?? {}),
        comments: [...d.comments, ...(j.comments ?? []).filter((c) => !d.comments.some((x) => x.id === c.id))],
        chat: d.chat.length ? d.chat : j.chat ?? [],
        settings: { ...d.settings, athleteProfile: d.settings.athleteProfile || j.settings?.athleteProfile || "" },
      }));
      setMotraMsg("Backup ripristinato.");
    } catch (e) {
      setMotraMsg(`Errore: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const ranged = filterRange(data.workouts, from, to);
  const suffix = `${from}_${to}`;
  const setPreset = (days: number | "week" | "all") => {
    const t = todayKey();
    if (days === "all") { setFrom(data.workouts.map((w) => dayKey(w.start)).sort()[0] ?? t); setTo(t); }
    else if (days === "week") { setFrom(weekStart(t)); setTo(t); }
    else { setFrom(addDays(t, -days)); setTo(t); }
  };

  return (
    <div className="grid">
      <Card title="1 · Apple Salute (HRV, VO₂max, FC, sonno, attività)" className="span-3-half">
        <ol className="steps">
          <li>Su iPhone apri <b>Salute</b> → tocca la tua foto in alto a destra → <b>Esporta tutti i dati sanitari</b>.</li>
          <li>Salva/condividi lo ZIP (es. su File o AirDrop sul Mac) e caricalo qui sotto. Puoi caricare anche solo <code>esportazione.xml</code>.</li>
        </ol>
        <div className="row">
          <label className="field inline">
            <span>Periodo</span>
            <select value={since} onChange={(e) => setSince(e.target.value)}>
              <option value="90">Ultimi 3 mesi</option>
              <option value="365">Ultimo anno</option>
              <option value="730">Ultimi 2 anni</option>
              <option value="all">Tutto</option>
            </select>
          </label>
          <label className="btn primary file-btn">
            Scegli export.zip / .xml
            <input type="file" accept=".zip,.xml,application/zip,text/xml" onChange={(e) => e.target.files?.[0] && importApple(e.target.files[0])} />
          </label>
        </div>
        {appleState && (
          <div className="progress-box">
            <div className="progress"><div style={{ width: `${appleState.pct}%` }} /></div>
            <div className="muted small">{appleState.msg} {appleState.pct < 100 && appleState.records ? `${fmtNum(appleState.records)} campioni…` : ""}</div>
          </div>
        )}
        <p className="muted small">Il file viene elaborato solo nel tuo browser: nessun dato viene caricato su server.</p>
      </Card>

      <Card title="2 · Allenamenti Motra" className="span-3-half">
        <p>Carica un file <code>.json</code>, <code>.csv</code> o <code>.txt</code> con gli allenamenti, oppure incolla qui sotto il dettaglio degli allenamenti nel formato Motra.</p>
        <details>
          <summary>Come ottengo i dati da Motra?</summary>
          <p className="small">Il modo più semplice: in Claude (con il connettore Motra attivo) incolla questo messaggio e scarica il file JSON che ti prepara, poi caricalo qui.</p>
          <pre className="code">{CLAUDE_MOTRA_PROMPT}</pre>
          <button className="btn ghost" onClick={() => { void navigator.clipboard.writeText(CLAUDE_MOTRA_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copiato ✓" : "Copia il messaggio"}</button>
          <p className="small">In alternativa puoi incollare il testo dei dettagli degli allenamenti (righe “Workout: …”, “- Esercizio (id) (3 sets):”, “set 1: 10 reps @ 60kg, 2m rest”) o un CSV con colonne <code>date, workout, exercise, reps, weight, rest, rpe, warmup</code>.</p>
        </details>
        <div className="row">
          <label className="btn primary file-btn">
            Carica file Motra
            <input type="file" accept=".json,.txt,.csv,application/json,text/plain,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await importMotra(await f.text(), f.name); e.target.value = ""; }} />
          </label>
        </div>
        <textarea className="paste" rows={5} placeholder={"Workout: Venerdì Mattina Allenamento (workoutID: …)\n2026-10-30 07:09 AM | 43m | 177 kcal\n  - Barbell Romanian Deadlift (barbellRomanianDeadlift) (4 sets):\n    set 1: 10 reps @ 20kg [warmup]\n    set 2: 8 reps @ 60kg, 1m44s rest"} value={paste} onChange={(e) => setPaste(e.target.value)} />
        <button className="btn" disabled={!paste.trim()} onClick={() => importMotra(paste, "incollato.txt")}>Importa testo incollato</button>
        {motraMsg && <p className={motraMsg.startsWith("Errore") ? "error" : "ok"}>{motraMsg}</p>}
      </Card>

      <Card title="3 · Scarica i tuoi allenamenti" className="span-3">
        <div className="row wrap">
          <label className="field inline"><span>Dal</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field inline"><span>Al</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <div className="seg">
            <button onClick={() => setPreset("week")}>Settimana</button>
            <button onClick={() => setPreset(30)}>30 gg</button>
            <button onClick={() => setPreset(90)}>90 gg</button>
            <button onClick={() => setPreset(365)}>1 anno</button>
            <button onClick={() => setPreset("all")}>Tutto</button>
          </div>
          <span className="muted">{ranged.length} allenamenti nel periodo</span>
        </div>
        <div className="export-grid">
          <button className="export" disabled={!ranged.length} onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.write(reportHtml(data, ranged, `Diario allenamenti ${from} – ${to}`)); w.document.close(); } }}>
            <b>📄 Diario PDF / stampa</b><span>Tutti gli allenamenti con serie, salute del giorno e commenti del coach</span>
          </button>
          <button className="export" disabled={!ranged.length} onClick={() => download(`diario-allenamenti_${suffix}.html`, reportHtml(data, ranged, `Diario allenamenti ${from} – ${to}`), "text/html")}>
            <b>🌐 Diario HTML</b><span>Lo stesso diario come file da conservare o condividere</span>
          </button>
          <button className="export" disabled={!ranged.length} onClick={() => download(`serie_${suffix}.csv`, setsCsv(ranged), "text/csv")}>
            <b>📊 Serie (CSV)</b><span>Una riga per ogni serie: per Excel, Numbers, Google Sheets</span>
          </button>
          <button className="export" disabled={!ranged.length} onClick={() => download(`allenamenti_${suffix}.csv`, workoutsCsv(data, ranged), "text/csv")}>
            <b>🏋️ Allenamenti (CSV)</b><span>Una riga per allenamento con HRV, FC riposo, sonno del giorno</span>
          </button>
          <button className="export" disabled={!Object.keys(data.daily).length} onClick={() => download(`salute_${suffix}.csv`, healthCsv(data, from, to), "text/csv")}>
            <b>❤️ Metriche salute (CSV)</b><span>HRV, VO₂max, FC, sonno, passi, peso giorno per giorno</span>
          </button>
          <button className="export" disabled={!ranged.length} onClick={() => download(`allenamenti_${suffix}.ics`, workoutsIcs(ranged, data), "text/calendar")}>
            <b>📅 Calendario (.ics)</b><span>Importa gli allenamenti fatti in Apple Calendario / Google Calendar</span>
          </button>
          <button className="export" onClick={() => download(`motra-coach-backup_${todayKey()}.json`, backupJson(data), "application/json")}>
            <b>💾 Backup completo (JSON)</b><span>Tutti i dati e i commenti del coach, re-importabile</span>
          </button>
        </div>
      </Card>

      <Card title="Altro" className="span-3">
        <div className="row wrap">
          <label className="btn file-btn">
            Ripristina backup JSON
            <input type="file" accept=".json,application/json" onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          </label>
          <button className="btn" onClick={() => { const d = demoData(); applyImport(d.workouts, d.daily, "Demo"); }}>Carica dati dimostrativi</button>
          <button className="btn danger" onClick={async () => {
            if (!confirm("Cancellare tutti i dati salvati in questo browser? (la chiave API e il profilo restano)")) return;
            await clearData();
            update((d) => ({ ...d, workouts: [], daily: {}, comments: [], chat: [], lastImport: undefined }));
          }}>Cancella tutti i dati</button>
          {data.lastImport && <span className="muted small">Ultimo import: {data.lastImport}</span>}
        </div>
        <p className="muted small">In archivio: {data.workouts.length} allenamenti · {Object.keys(data.daily).length} giorni di metriche · {data.comments.length} commenti del coach.</p>
      </Card>
    </div>
  );
}
