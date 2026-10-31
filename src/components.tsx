import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import { useApp } from "./state";
import { askCoach, friendlyError } from "./lib/coach";
import { dayKey, describeSet, fmtDate, fmtDuration, fmtNum, uid, workoutSets, workoutVolume } from "./lib/util";
import type { CoachComment } from "./types";

// Palette accessibile (contrasto adeguato su sfondo chiaro e scuro)
export const COLORS = {
  primary: "#3b6ef5",
  secondary: "#e8833a",
  tertiary: "#1f9d74",
  quaternary: "#a855f7",
  muted: "#94a3b8",
};

export function Card({ title, children, actions, className = "" }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          {title && <h3>{title}</h3>}
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, delta, hint }: { label: string; value: string; unit?: string; delta?: { text: string; good?: boolean }; hint?: string }) {
  return (
    <div className="stat" title={hint}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {unit && <span className="stat-unit"> {unit}</span>}
      </div>
      {delta && <div className={`stat-delta ${delta.good === undefined ? "" : delta.good ? "good" : "bad"}`}>{delta.text}</div>}
    </div>
  );
}

const fmtAxisDate = (d: string) => {
  const [, m, g] = d.split("-");
  return `${+g}/${+m}`;
};

export interface SeriesDef {
  key: string;
  label: string;
  color: string;
  kind?: "line" | "bar" | "dots";
  axis?: "left" | "right";
  digits?: number;
  unit?: string;
}

/** Grafico temporale generico (linee, barre o punti) */
export function TimeChart({ rows, series, height = 260 }: { rows: object[]; series: SeriesDef[]; height?: number }) {
  if (!rows.length) return <p className="empty">Nessun dato nel periodo selezionato.</p>;
  const hasRight = series.some((s) => s.axis === "right");
  // le barre devono partire da zero; le linee possono avere un asse "stretto"
  const domain = (axis: "left" | "right"): [number | "auto", "auto"] =>
    series.some((s) => (s.axis ?? "left") === axis && s.kind === "bar") ? [0, "auto"] : ["auto", "auto"];
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: hasRight ? 0 : 12, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="date" tickFormatter={fmtAxisDate} tick={{ fontSize: 11, fill: "var(--muted)" }} minTickGap={24} stroke="var(--grid)" />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--grid)" domain={domain("left")} width={48} />
          {hasRight && <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--muted)" }} stroke="var(--grid)" domain={domain("right")} width={48} />}
          <Tooltip
            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
            labelFormatter={(d) => fmtDate(String(d))}
            formatter={(v, name) => {
              const s = series.find((x) => x.label === name);
              return [`${fmtNum(Number(v), s?.digits ?? 1)}${s?.unit ? " " + s.unit : ""}`, name];
            }}
          />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
          {series.map((s) =>
            s.kind === "bar" ? (
              <Bar key={s.key} yAxisId={s.axis ?? "left"} dataKey={s.key} name={s.label} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            ) : (
              <Line
                key={s.key} yAxisId={s.axis ?? "left"} dataKey={s.key} name={s.label} stroke={s.color}
                strokeWidth={s.kind === "dots" ? 0 : 2} dot={s.kind === "dots" ? { r: 2.5, fill: s.color, strokeWidth: 0 } : false}
                activeDot={{ r: 4 }} connectNulls type="monotone" isAnimationActive={false}
              />
            ),
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Markdown minimale e sicuro (titoli, elenchi, grassetto, corsivo) */
export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
    const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>").replace(/_(.+?)_/g, "<i>$1</i>").replace(/`([^`]+)`/g, "<code>$1</code>");
    const out: string[] = [];
    let list: "ul" | "ol" | null = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of text.split("\n")) {
      const line = raw.trimEnd();
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { close(); out.push(`<h4>${inline(m[2])}</h4>`); }
      else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if (/^\s*(---|\*\*\*)\s*$/.test(line)) { close(); out.push("<hr>"); }
      else if (!line.trim()) close();
      else { close(); out.push(`<p>${inline(line)}</p>`); }
    }
    close();
    return out.join("");
  }, [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Bottone + area che chiede al coach un commento e lo salva */
export function CoachComments({ target, prompt, focusWorkoutId }: { target: string; prompt: string; focusWorkoutId?: string }) {
  const { data, update } = useApp();
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [err, setErr] = useState("");
  const abort = useRef<AbortController | null>(null);
  const comments = data.comments.filter((c) => c.target === target);

  const run = async () => {
    setBusy(true); setErr(""); setLive("");
    abort.current = new AbortController();
    try {
      const text = await askCoach({ data, messages: [{ role: "user", content: prompt }], focusWorkoutId, onText: (_, full) => setLive(full), signal: abort.current.signal });
      const c: CoachComment = { id: uid("c"), target, createdAt: new Date().toISOString(), text };
      update((d) => ({ ...d, comments: [...d.comments, c] }));
      setLive("");
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="coach-comments">
      {comments.map((c) => (
        <div key={c.id} className="coach-bubble">
          <div className="coach-bubble-head">
            <span>🧠 Coach AI · {new Date(c.createdAt).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}</span>
            <button className="link" onClick={() => update((d) => ({ ...d, comments: d.comments.filter((x) => x.id !== c.id) }))}>elimina</button>
          </div>
          <Markdown text={c.text} />
        </div>
      ))}
      {busy && (
        <div className="coach-bubble live">
          <div className="coach-bubble-head"><span>🧠 Coach AI {live ? "sta scrivendo…" : "sta analizzando i dati…"}</span><button className="link" onClick={() => abort.current?.abort()}>annulla</button></div>
          {live ? <Markdown text={live} /> : <div className="dots"><span /><span /><span /></div>}
        </div>
      )}
      {err && <div className="error">{err}</div>}
      {!busy && <button className="btn primary" onClick={run}>{comments.length ? "Chiedi un nuovo commento" : "Chiedi un commento al coach AI"}</button>}
    </div>
  );
}

export function WorkoutModal() {
  const { data, openWorkoutId, openWorkout, update } = useApp();
  const w = data.workouts.find((x) => x.id === openWorkoutId);
  if (!w) return null;
  const dm = data.daily[dayKey(w.start)] ?? {};
  const vol = workoutVolume(w);
  return (
    <div className="modal-back" onClick={() => openWorkout(null)}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <header className="modal-head">
          <div>
            <div className="muted small">{fmtDate(w.start, true)} · {w.source === "motra" ? "Motra" : w.source === "apple" ? "Apple Salute" : "Manuale"}</div>
            <h2>{w.name}</h2>
          </div>
          <button className="icon-btn" onClick={() => openWorkout(null)} aria-label="Chiudi">✕</button>
        </header>
        <div className="stats-row">
          {w.durationMin !== undefined && <Stat label="Durata" value={fmtNum(w.durationMin)} unit="min" />}
          {w.calories !== undefined && <Stat label="Calorie" value={fmtNum(w.calories)} unit="kcal" />}
          {w.distanceKm !== undefined && <Stat label="Distanza" value={fmtNum(w.distanceKm, 2)} unit="km" />}
          {w.distanceKm && w.durationMin ? <Stat label="Passo" value={fmtDuration((w.durationMin * 60) / w.distanceKm)} unit="/km" /> : null}
          {w.avgHr !== undefined && <Stat label="FC media" value={fmtNum(w.avgHr)} unit="bpm" />}
          {vol > 0 && <Stat label="Volume" value={fmtNum(vol)} unit="kg" />}
          {workoutSets(w) > 0 && <Stat label="Serie" value={String(workoutSets(w))} />}
        </div>
        {(dm.hrv || dm.restingHr || dm.sleepH) && (
          <p className="muted small">
            Quel giorno: {[dm.hrv && `HRV ${fmtNum(dm.hrv)} ms`, dm.restingHr && `FC riposo ${fmtNum(dm.restingHr)} bpm`, dm.sleepH && `sonno ${fmtNum(dm.sleepH, 1)} h`, dm.vo2max && `VO₂max ${fmtNum(dm.vo2max, 1)}`].filter(Boolean).join(" · ")}
          </p>
        )}
        {w.muscleGroups?.length ? <div className="chips">{w.muscleGroups.map((m) => <span key={m} className="chip">{m}</span>)}</div> : null}
        {w.exercises?.map((e) => (
          <div key={e.id + e.name} className="exercise-block">
            <div className="exercise-name">{e.name}</div>
            {e.note && <div className="muted small">Nota: {e.note}</div>}
            <table className="sets">
              <tbody>
                {e.sets.map((s, i) => (
                  <tr key={i} className={s.warmup ? "warmup" : ""}>
                    <td className="muted">{s.warmup ? "R" : i + 1 - e.sets.filter((x, j) => j < i && x.warmup).length}</td>
                    <td>{describeSet(s)}</td>
                    <td className="muted">{s.restSec ? `rec. ${fmtDuration(s.restSec)}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <label className="field">
          <span>Note personali</span>
          <textarea rows={2} value={w.notes ?? ""} placeholder="Come ti sei sentito, dolori, sensazioni…"
            onChange={(ev) => update((d) => ({ ...d, workouts: d.workouts.map((x) => (x.id === w.id ? { ...x, notes: ev.target.value } : x)) }))} />
        </label>
        <h3 className="section-title">Commento del coach</h3>
        <CoachComments
          target={w.id}
          focusWorkoutId={w.id}
          prompt={`Commenta l'allenamento "${w.name}" del ${fmtDate(w.start, true)} (vedi sezione "Allenamento da commentare"). Valuta esecuzione di carichi, volume e recuperi rispetto alle sedute precedenti degli stessi esercizi e al mio stato di recupero di quel giorno. Chiudi con 2-3 indicazioni concrete per la prossima seduta simile.${w.notes ? ` Mie note: ${w.notes}` : ""}`}
        />
      </div>
    </div>
  );
}
