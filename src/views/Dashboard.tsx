import { useMemo } from "react";
import { useApp } from "../state";
import { Card, COLORS, CoachComments, Stat, TimeChart } from "../components";
import { addDays, avgOf, dayKey, fmtDate, fmtNum, metricSeries, sortWorkouts, todayKey, weekStart, workoutVolume } from "../lib/util";
import type { MetricKey } from "../types";

export function readiness(daily: ReturnType<typeof useApp>["data"]["daily"], day = todayKey()) {
  // confronto ultimi 3 giorni vs baseline 30 giorni
  const win = (k: MetricKey, a: number, b: number) => avgOf(Object.keys(daily).filter((d) => d > addDays(day, -a) && d <= addDays(day, -b)).map((d) => daily[d][k]));
  const hrv3 = win("hrv", 3, 0), hrv30 = win("hrv", 30, 3);
  const rhr3 = win("restingHr", 3, 0), rhr30 = win("restingHr", 30, 3);
  const sl3 = win("sleepH", 3, 0);
  if (hrv3 === undefined && rhr3 === undefined && sl3 === undefined) return null;
  let score = 70;
  if (hrv3 && hrv30) score += Math.max(-25, Math.min(20, ((hrv3 - hrv30) / hrv30) * 100));
  if (rhr3 && rhr30) score -= Math.max(-10, Math.min(20, ((rhr3 - rhr30) / rhr30) * 200));
  if (sl3) score += Math.max(-20, Math.min(10, (sl3 - 7) * 10));
  score = Math.round(Math.max(0, Math.min(100, score)));
  const label = score >= 75 ? "Pronto per spingere" : score >= 55 ? "Allenamento normale" : score >= 40 ? "Meglio un carico leggero" : "Priorità al recupero";
  return { score, label, hrv3, hrv30, rhr3, rhr30, sl3 };
}

export function Dashboard({ go }: { go: (tab: string) => void }) {
  const { data, openWorkout } = useApp();
  const today = todayKey();
  const ws = useMemo(() => sortWorkouts(data.workouts), [data.workouts]);
  const thisWeek = weekStart(today);
  const weekWs = ws.filter((w) => dayKey(w.start) >= thisWeek);
  const lastWeekWs = ws.filter((w) => dayKey(w.start) >= addDays(thisWeek, -7) && dayKey(w.start) < thisWeek);
  const vol = (list: typeof ws) => list.reduce((a, w) => a + workoutVolume(w), 0);
  const ready = readiness(data.daily);
  const vo2 = metricSeries(data.daily, "vo2max");
  const lastVo2 = vo2[vo2.length - 1];
  const prevVo2 = vo2.filter((p) => lastVo2 && p.date <= addDays(lastVo2.date, -30)).pop();

  const weekly = useMemo(() => {
    const rows: { date: string; allenamenti: number; volume: number; minuti: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const start = addDays(thisWeek, -7 * i);
      const end = addDays(start, 7);
      const list = ws.filter((w) => dayKey(w.start) >= start && dayKey(w.start) < end);
      rows.push({ date: start, allenamenti: list.length, volume: Math.round(vol(list)), minuti: list.reduce((a, w) => a + (w.durationMin ?? 0), 0) });
    }
    return rows;
  }, [ws, thisWeek]);

  if (!data.workouts.length && !Object.keys(data.daily).length) {
    return (
      <Card title="Benvenuto 👋">
        <p>Questa app unisce gli allenamenti di <b>Motra</b> e i dati di <b>Apple Salute</b> (HRV, VO₂max, FC a riposo, sonno, passi…) in un calendario, con grafici per ogni esercizio, export dei dati e un <b>coach AI</b> che commenta i tuoi allenamenti.</p>
        <ol>
          <li>Vai su <b>Importa / Esporta</b> e carica l'esportazione di Apple Salute (ZIP) e i dati Motra.</li>
          <li>Inserisci la tua chiave API Anthropic in <b>Impostazioni</b> per attivare il coach.</li>
        </ol>
        <button className="btn primary" onClick={() => go("import")}>Importa i dati</button>
      </Card>
    );
  }

  const delta = (a?: number, b?: number, better: "up" | "down" = "up", digits = 0) => {
    if (a === undefined || b === undefined) return undefined;
    const diff = a - b;
    return { text: `${diff >= 0 ? "+" : ""}${fmtNum(diff, digits)} vs media 30gg`, good: Math.abs(diff) < 0.5 ? undefined : better === "up" ? diff > 0 : diff < 0 };
  };

  return (
    <div className="grid">
      <div className="stats-row wide">
        <Stat label="Allenamenti settimana" value={String(weekWs.length)} delta={{ text: `${lastWeekWs.length} la settimana scorsa` }} />
        <Stat label="Volume settimana" value={fmtNum(vol(weekWs))} unit="kg" delta={{ text: `${fmtNum(vol(lastWeekWs))} kg sett. scorsa` }} />
        <Stat label="HRV (3 gg)" value={fmtNum(ready?.hrv3)} unit="ms" delta={delta(ready?.hrv3, ready?.hrv30)} />
        <Stat label="FC a riposo (3 gg)" value={fmtNum(ready?.rhr3)} unit="bpm" delta={delta(ready?.rhr3, ready?.rhr30, "down")} />
        <Stat label="Sonno (3 gg)" value={fmtNum(ready?.sl3, 1)} unit="h" />
        <Stat label="VO₂max" value={fmtNum(lastVo2?.value, 1)} unit="ml/kg/min" delta={prevVo2 && lastVo2 ? { text: `${lastVo2.value - prevVo2.value >= 0 ? "+" : ""}${fmtNum(lastVo2.value - prevVo2.value, 1)} in 30+ gg`, good: lastVo2.value >= prevVo2.value } : undefined} />
      </div>

      {ready && (
        <Card title="Prontezza di oggi" className="span-1">
          <div className="readiness">
            <div className="gauge" style={{ ["--p" as string]: ready.score }}>
              <span>{ready.score}</span>
            </div>
            <div>
              <div className="readiness-label">{ready.label}</div>
              <p className="muted small">Stima basata su HRV e FC a riposo degli ultimi 3 giorni rispetto alla tua media di 30 giorni, e sul sonno recente. Non è un parere medico.</p>
            </div>
          </div>
        </Card>
      )}

      <Card title="Ultime 12 settimane" className="span-2">
        <TimeChart rows={weekly} height={220} series={[
          { key: "volume", label: "Volume (kg)", color: COLORS.primary, kind: "bar", digits: 0, unit: "kg" },
          { key: "allenamenti", label: "Allenamenti", color: COLORS.secondary, axis: "right", digits: 0 },
        ]} />
      </Card>

      <Card title="Ultimi allenamenti" className="span-2" actions={<button className="btn ghost" onClick={() => go("calendar")}>Calendario →</button>}>
        <ul className="workout-list">
          {ws.slice(0, 8).map((w) => (
            <li key={w.id} onClick={() => openWorkout(w.id)}>
              <span className={`dot src-${w.source}`} />
              <div className="grow">
                <div className="wl-name">{w.name}</div>
                <div className="muted small">{fmtDate(w.start, true)}</div>
              </div>
              <div className="muted small right">
                {[w.durationMin && `${w.durationMin} min`, workoutVolume(w) ? `${fmtNum(workoutVolume(w))} kg` : w.distanceKm && `${fmtNum(w.distanceKm, 1)} km`].filter(Boolean).join(" · ")}
                {data.comments.some((c) => c.target === w.id) && " · 🧠"}
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Commento del coach sulla settimana" className="span-1">
        <CoachComments
          target={`week:${thisWeek}`}
          prompt="Fammi un resoconto di questa settimana (da lunedì a oggi): allenamenti fatti, carico, recupero (HRV, FC a riposo, sonno) e come impostare i prossimi giorni."
        />
      </Card>
    </div>
  );
}
