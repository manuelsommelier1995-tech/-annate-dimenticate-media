import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Card } from "../components";
import { dayKey, fmtDate, fmtNum, MONTHS, pad, todayKey, WEEKDAYS, workoutCategory, workoutVolume } from "../lib/util";
import type { Workout } from "../types";

const typeClass = (w: Workout) => {
  const c = workoutCategory(w);
  if (c === "strength") return "t-strength";
  if (c === "cardio" || /scale/i.test(w.type ?? "")) return "t-cardio";
  if (/yoga|mobilit|pilates|defatic|stretch/i.test(`${w.type ?? ""} ${w.name}`)) return "t-mobility";
  return "t-other";
};

export function CalendarView() {
  const { data, openWorkout } = useApp();
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<string | null>(todayKey());

  const byDay = useMemo(() => {
    const m = new Map<string, Workout[]>();
    for (const w of data.workouts) {
      const k = dayKey(w.start);
      m.set(k, [...(m.get(k) ?? []), w].sort((a, b) => a.start.localeCompare(b.start)));
    }
    return m;
  }, [data.workouts]);

  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells: (string | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${ym.y}-${pad(ym.m + 1)}-${pad(i + 1)}`),
  ];
  while (cells.length % 7) cells.push(null);

  const monthWs = cells.flatMap((c) => (c ? byDay.get(c) ?? [] : []));
  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const sel = selected ? byDay.get(selected) ?? [] : [];
  const selHealth = selected ? data.daily[selected] : undefined;
  const today = todayKey();

  return (
    <div className="grid">
      <Card
        className="span-2"
        title={`${MONTHS[ym.m]} ${ym.y}`}
        actions={
          <>
            <button className="btn ghost" onClick={() => shift(-1)} aria-label="Mese precedente">‹</button>
            <button className="btn ghost" onClick={() => { setYm({ y: now.getFullYear(), m: now.getMonth() }); setSelected(today); }}>Oggi</button>
            <button className="btn ghost" onClick={() => shift(1)} aria-label="Mese successivo">›</button>
          </>
        }
      >
        <p className="muted small">
          {monthWs.length} allenamenti · {fmtNum(monthWs.reduce((a, w) => a + (w.durationMin ?? 0), 0) / 60, 1)} ore ·{" "}
          {fmtNum(monthWs.reduce((a, w) => a + workoutVolume(w), 0))} kg sollevati ·{" "}
          {fmtNum(monthWs.reduce((a, w) => a + (w.distanceKm ?? 0), 0), 1)} km
        </p>
        <div className="cal">
          {WEEKDAYS.map((d) => <div key={d} className="cal-wd">{d}</div>)}
          {cells.map((c, i) => {
            if (!c) return <div key={i} className="cal-cell empty" />;
            const list = byDay.get(c) ?? [];
            const h = data.daily[c];
            return (
              <button key={c} className={`cal-cell ${c === selected ? "sel" : ""} ${c === today ? "today" : ""} ${list.length ? "has" : ""}`} onClick={() => setSelected(c)}>
                <span className="cal-num">{+c.slice(8)}</span>
                <span className="cal-items">
                  {list.slice(0, 3).map((w) => (
                    <span key={w.id} className={`cal-pill ${typeClass(w)}`} title={w.name}>
                      {w.name}
                      {data.comments.some((x) => x.target === w.id) ? " 🧠" : ""}
                    </span>
                  ))}
                  {list.length > 3 && <span className="muted small">+{list.length - 3}</span>}
                </span>
                {h?.hrv !== undefined && <span className="cal-hrv" title="HRV">♡ {Math.round(h.hrv)}</span>}
              </button>
            );
          })}
        </div>
        <div className="legend">
          <span><i className="t-strength" /> Forza</span>
          <span><i className="t-cardio" /> Cardio</span>
          <span><i className="t-mobility" /> Mobilità</span>
          <span><i className="t-other" /> Altro</span>
          <span>♡ HRV del giorno (ms)</span>
        </div>
      </Card>

      <Card className="span-1" title={selected ? fmtDate(selected) : "Seleziona un giorno"}>
        {selHealth && (
          <div className="kv">
            {selHealth.hrv !== undefined && <div><span>HRV</span><b>{fmtNum(selHealth.hrv)} ms</b></div>}
            {selHealth.restingHr !== undefined && <div><span>FC riposo</span><b>{fmtNum(selHealth.restingHr)} bpm</b></div>}
            {selHealth.sleepH !== undefined && <div><span>Sonno</span><b>{fmtNum(selHealth.sleepH, 1)} h</b></div>}
            {selHealth.vo2max !== undefined && <div><span>VO₂max</span><b>{fmtNum(selHealth.vo2max, 1)}</b></div>}
            {selHealth.steps !== undefined && <div><span>Passi</span><b>{fmtNum(selHealth.steps)}</b></div>}
            {selHealth.activeKcal !== undefined && <div><span>Kcal attive</span><b>{fmtNum(selHealth.activeKcal)}</b></div>}
            {selHealth.weight !== undefined && <div><span>Peso</span><b>{fmtNum(selHealth.weight, 1)} kg</b></div>}
          </div>
        )}
        {sel.length === 0 && <p className="empty">Nessun allenamento in questo giorno.</p>}
        <ul className="workout-list">
          {sel.map((w) => (
            <li key={w.id} onClick={() => openWorkout(w.id)}>
              <span className={`dot ${typeClass(w)}`} />
              <div className="grow">
                <div className="wl-name">{w.name}</div>
                <div className="muted small">
                  {w.start.slice(11, 16)} · {[w.durationMin && `${w.durationMin} min`, w.exercises?.length && `${w.exercises.length} esercizi`, w.distanceKm && `${fmtNum(w.distanceKm, 2)} km`].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="muted">›</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
