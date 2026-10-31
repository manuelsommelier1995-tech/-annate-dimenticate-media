import { useMemo, useState } from "react";
import { useApp } from "../state";
import { Card, COLORS, CoachComments, TimeChart } from "../components";
import { addDays, avgOf, dayKey, fmtNum, METRICS, metricSeries, rollingAvg, todayKey } from "../lib/util";

const RANGES = [
  { label: "30 gg", days: 30 },
  { label: "90 gg", days: 90 },
  { label: "6 mesi", days: 182 },
  { label: "1 anno", days: 365 },
  { label: "Tutto", days: 0 },
];

export function HealthView() {
  const { data } = useApp();
  const [range, setRange] = useState(1);
  const today = todayKey();
  const from = RANGES[range].days ? addDays(today, -RANGES[range].days) : "";
  const available = METRICS.filter((m) => Object.values(data.daily).some((d) => d[m.key] !== undefined));

  const load = useMemo(() => {
    // carico giornaliero (minuti di allenamento) + HRV media 7 gg
    const hrv = rollingAvg(metricSeries(data.daily, "hrv"), 7);
    const hrvMap = new Map(hrv.map((p) => [p.date, p.avg]));
    const mins = new Map<string, number>();
    for (const w of data.workouts) {
      const d = dayKey(w.start);
      mins.set(d, (mins.get(d) ?? 0) + (w.durationMin ?? 0));
    }
    const rows: { date: string; minuti?: number; hrv7?: number }[] = [];
    const start = from || [...hrvMap.keys(), ...mins.keys()].sort()[0];
    if (!start) return rows;
    for (let d = start; d <= today; d = addDays(d, 1)) rows.push({ date: d, minuti: mins.get(d), hrv7: hrvMap.get(d) });
    return rows;
  }, [data, from, today]);

  if (!available.length) {
    return <Card title="Salute"><p className="empty">Nessun dato di salute: importa l'esportazione di Apple Salute da “Importa / Esporta”.</p></Card>;
  }

  return (
    <div className="grid">
      <div className="toolbar span-3">
        <div className="seg">
          {RANGES.map((r, i) => <button key={r.label} className={i === range ? "on" : ""} onClick={() => setRange(i)}>{r.label}</button>)}
        </div>
      </div>

      {data.daily && metricSeries(data.daily, "hrv").length > 0 && (
        <Card title="Carico di allenamento vs recupero" className="span-3">
          <TimeChart rows={load} height={240} series={[
            { key: "minuti", label: "Minuti di allenamento", color: COLORS.muted, kind: "bar", digits: 0, unit: "min" },
            { key: "hrv7", label: "HRV media 7 gg", color: COLORS.primary, axis: "right", digits: 0, unit: "ms" },
          ]} />
        </Card>
      )}

      {available.map((m) => {
        const s = rollingAvg(metricSeries(data.daily, m.key, from, today), 7);
        const last = s[s.length - 1];
        const avg = avgOf(s.map((p) => p.value));
        return (
          <Card key={m.key} title={m.label} className="span-1">
            <div className="metric-head">
              <div><span className="big">{fmtNum(last?.value, m.digits)}</span> <span className="muted">{m.unit}</span></div>
              <div className="muted small right">media periodo<br /><b>{fmtNum(avg, m.digits)}</b> {m.unit}</div>
            </div>
            <TimeChart rows={s} height={170} series={[
              { key: "value", label: "Giornaliero", color: COLORS.muted, kind: "dots", digits: m.digits, unit: m.unit },
              { key: "avg", label: "Media 7 gg", color: COLORS.primary, digits: m.digits, unit: m.unit },
            ]} />
          </Card>
        );
      })}

      <Card title="Coach AI sulla salute" className="span-3">
        <CoachComments
          target={`health:${today}`}
          prompt="Analizza l'andamento delle mie metriche di salute (HRV, FC a riposo, VO2max, sonno, passi, peso) e come si collegano ai miei allenamenti. Cosa noti e cosa mi consigli?"
        />
      </Card>
    </div>
  );
}
