import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Card, COLORS, CoachComments, Stat, TimeChart } from "../components";
import { addDays, exerciseHistory, exerciseIndex, fmtDate, fmtNum, todayKey } from "../lib/util";

const RANGES = [
  { label: "3 mesi", days: 90 },
  { label: "6 mesi", days: 182 },
  { label: "1 anno", days: 365 },
  { label: "Tutto", days: 0 },
];

export function ExercisesView() {
  const { data, openWorkout } = useApp();
  const index = useMemo(() => exerciseIndex(data.workouts), [data.workouts]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [range, setRange] = useState(0);
  const current = sel ?? index[0]?.id ?? null;
  const from = RANGES[range].days ? addDays(todayKey(), -RANGES[range].days) : "";

  const hist = useMemo(() => (current ? exerciseHistory(data.workouts, current).filter((p) => p.date >= from) : []), [data.workouts, current, from]);
  const all = useMemo(() => (current ? exerciseHistory(data.workouts, current) : []), [data.workouts, current]);
  const info = index.find((e) => e.id === current);

  if (!index.length) {
    return <Card title="Esercizi"><p className="empty">Nessun esercizio ancora: importa gli allenamenti Motra da “Importa / Esporta”.</p></Card>;
  }

  const bestE1 = all.reduce((b, p) => Math.max(b, p.e1rm ?? 0), 0);
  const bestW = all.reduce((b, p) => Math.max(b, p.topWeight ?? 0), 0);
  const bestVol = all.reduce((b, p) => Math.max(b, p.volume), 0);
  const first = hist[0], last = hist[hist.length - 1];
  const hasLoad = all.some((p) => p.topWeight);
  const filtered = index.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="grid ex-layout">
      <Card className="ex-list">
        <input className="search" placeholder="Cerca esercizio…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul>
          {filtered.map((e) => (
            <li key={e.id} className={e.id === current ? "sel" : ""} onClick={() => setSel(e.id)}>
              <div>{e.name}</div>
              <div className="muted small">{e.sessions} sedute · ultima {fmtDate(e.lastDate)}</div>
            </li>
          ))}
        </ul>
      </Card>

      <div className="ex-main">
        <Card
          title={info?.name}
          actions={
            <div className="seg">
              {RANGES.map((r, i) => (
                <button key={r.label} className={i === range ? "on" : ""} onClick={() => setRange(i)}>{r.label}</button>
              ))}
            </div>
          }
        >
          <div className="stats-row">
            {hasLoad && <Stat label="Record 1RM stimato" value={fmtNum(bestE1, 1)} unit="kg" hint="Formula di Epley, serie ≤ 12 ripetizioni" />}
            {hasLoad && <Stat label="Carico massimo" value={fmtNum(bestW, 1)} unit="kg" />}
            <Stat label="Volume max seduta" value={fmtNum(bestVol)} unit="kg" />
            <Stat label="Sedute" value={String(all.length)} />
            {first && last && first !== last && hasLoad && first.e1rm && last.e1rm && (
              <Stat label="Variazione 1RM nel periodo" value={`${last.e1rm - first.e1rm >= 0 ? "+" : ""}${fmtNum(last.e1rm - first.e1rm, 1)}`} unit="kg"
                delta={{ text: `${fmtNum(((last.e1rm - first.e1rm) / first.e1rm) * 100, 1)}%`, good: last.e1rm >= first.e1rm }} />
            )}
          </div>
          {hasLoad ? (
            <>
              <h4 className="chart-title">Forza: 1RM stimato e carico massimo</h4>
              <TimeChart rows={hist} series={[
                { key: "e1rm", label: "1RM stimato", color: COLORS.primary, unit: "kg", digits: 1 },
                { key: "topWeight", label: "Carico max", color: COLORS.secondary, unit: "kg", digits: 1, kind: "dots" },
              ]} />
            </>
          ) : null}
          <h4 className="chart-title">Volume per seduta (kg × ripetizioni) e ripetizioni totali</h4>
          <TimeChart rows={hist} series={[
            ...(hasLoad ? [{ key: "volume", label: "Volume", color: COLORS.tertiary, kind: "bar" as const, unit: "kg", digits: 0 }] : []),
            { key: "totalReps", label: "Ripetizioni", color: COLORS.quaternary, axis: hasLoad ? ("right" as const) : ("left" as const), digits: 0 },
          ]} />
        </Card>

        <Card title="Storico sedute">
          <table className="table">
            <thead><tr><th>Data</th><th>Serie</th><th>Migliore serie</th><th>1RM st.</th><th>Volume</th></tr></thead>
            <tbody>
              {[...hist].reverse().map((p) => (
                <tr key={p.workoutId + p.date} onClick={() => openWorkout(p.workoutId)} className="clickable">
                  <td>{fmtDate(p.date)}</td><td>{p.sets}</td><td>{p.bestSet}</td><td>{p.e1rm ? fmtNum(p.e1rm, 1) : "–"}</td><td>{p.volume ? fmtNum(p.volume) : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {current && (
          <Card title="Coach AI su questo esercizio">
            <CoachComments
              key={current}
              target={`ex:${current}`}
              prompt={`Analizza la mia progressione su "${info?.name}". Storico sedute (data | serie | migliore serie | 1RM stimato | volume):\n${all.map((p) => `${p.date} | ${p.sets} | ${p.bestSet} | ${p.e1rm ?? "-"} | ${p.volume}`).join("\n")}\nSono in progresso o in stallo? Come dovrei impostare le prossime 4 settimane su questo esercizio (serie, ripetizioni, carichi)?`}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
