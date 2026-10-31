import type { DailyMetrics, MetricKey, SetEntry, Workout } from "../types";

export const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in ora locale */
export function dayKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function todayKey() {
  return dayKey(new Date());
}

/** Lunedì della settimana che contiene il giorno */
export function weekStart(key: string): string {
  const d = parseDay(key);
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return dayKey(d);
}

export const MONTHS = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
export const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function fmtDate(iso: string, withTime = false): string {
  const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
  const s = d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  if (!withTime || iso.length === 10) return s;
  return `${s} · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

export function fmtNum(n: number | undefined, digits = 0): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "–";
  return n.toLocaleString("it-IT", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- metriche ----------

export interface MetricMeta {
  key: MetricKey;
  label: string;
  unit: string;
  digits: number;
  /** "up" se un valore più alto è meglio */
  better: "up" | "down" | "neutral";
}

export const METRICS: MetricMeta[] = [
  { key: "hrv", label: "HRV (SDNN)", unit: "ms", digits: 0, better: "up" },
  { key: "restingHr", label: "FC a riposo", unit: "bpm", digits: 0, better: "down" },
  { key: "vo2max", label: "VO₂max", unit: "ml/kg/min", digits: 1, better: "up" },
  { key: "sleepH", label: "Sonno", unit: "h", digits: 1, better: "up" },
  { key: "steps", label: "Passi", unit: "", digits: 0, better: "up" },
  { key: "activeKcal", label: "Calorie attive", unit: "kcal", digits: 0, better: "neutral" },
  { key: "exerciseMin", label: "Minuti esercizio", unit: "min", digits: 0, better: "up" },
  { key: "weight", label: "Peso", unit: "kg", digits: 1, better: "neutral" },
  { key: "bodyFat", label: "Massa grassa", unit: "%", digits: 1, better: "down" },
  { key: "walkingHr", label: "FC media camminata", unit: "bpm", digits: 0, better: "down" },
  { key: "hrRecovery", label: "Recupero FC 1 min", unit: "bpm", digits: 0, better: "up" },
  { key: "respRate", label: "Frequenza respiratoria", unit: "resp/min", digits: 1, better: "neutral" },
  { key: "spo2", label: "Ossigeno nel sangue", unit: "%", digits: 1, better: "up" },
  { key: "distanceKm", label: "Distanza a piedi/corsa", unit: "km", digits: 1, better: "up" },
  { key: "hrAvg", label: "FC media", unit: "bpm", digits: 0, better: "neutral" },
  { key: "sleepDeepH", label: "Sonno profondo", unit: "h", digits: 1, better: "up" },
  { key: "sleepRemH", label: "Sonno REM", unit: "h", digits: 1, better: "up" },
];

export const metricMeta = (k: MetricKey) => METRICS.find((m) => m.key === k)!;

export function metricSeries(daily: Record<string, DailyMetrics>, key: MetricKey, from?: string, to?: string) {
  return Object.keys(daily)
    .filter((d) => (!from || d >= from) && (!to || d <= to) && daily[d][key] !== undefined)
    .sort()
    .map((d) => ({ date: d, value: daily[d][key] as number }));
}

/** media mobile su finestra di N giorni di calendario */
export function rollingAvg(series: { date: string; value: number }[], days = 7) {
  return series.map((p, i) => {
    const from = addDays(p.date, -(days - 1));
    let sum = 0, n = 0;
    for (let j = i; j >= 0 && series[j].date >= from; j--) { sum += series[j].value; n++; }
    return { ...p, avg: n ? sum / n : undefined };
  });
}

export function avgOf(values: (number | undefined)[]): number | undefined {
  const v = values.filter((x): x is number => typeof x === "number" && !Number.isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
}

// ---------- allenamenti ----------

/** 1RM stimato (Epley), solo per serie con carico e ≤ 12 ripetizioni */
export function e1rm(s: SetEntry): number | undefined {
  if (!s.weight || !s.reps || s.reps > 12 || s.warmup) return undefined;
  return s.reps === 1 ? s.weight : s.weight * (1 + s.reps / 30);
}

export function setVolume(s: SetEntry): number {
  return (s.weight ?? 0) * (s.reps ?? 0);
}

export function workoutVolume(w: Workout): number {
  return (w.exercises ?? []).reduce((t, e) => t + e.sets.reduce((a, s) => a + (s.warmup ? 0 : setVolume(s)), 0), 0);
}

export function workoutSets(w: Workout): number {
  return (w.exercises ?? []).reduce((t, e) => t + e.sets.filter((s) => !s.warmup).length, 0);
}

export function sortWorkouts(ws: Workout[]) {
  return [...ws].sort((a, b) => b.start.localeCompare(a.start));
}

/**
 * Unisce nuovi allenamenti a quelli esistenti.
 * - stesso id → sostituito
 * - un allenamento Apple Salute che inizia entro 15 min da uno Motra viene
 *   considerato lo stesso: i suoi dati (FC, distanza, kcal) arricchiscono quello Motra.
 */
export function mergeWorkouts(existing: Workout[], incoming: Workout[]): Workout[] {
  const map = new Map(existing.map((w) => [w.id, w]));
  for (const w of incoming) map.set(w.id, { ...map.get(w.id), ...w });
  const all = [...map.values()].map((w) => ({ ...w }));
  const motra = all.filter((w) => w.source !== "apple");
  const apple = all.filter((w) => w.source === "apple");
  const keptApple: Workout[] = [];
  for (const a of apple) {
    const twin = motra.find((m) => sameSession(m, a));
    if (twin) {
      // Apple Salute registra l'ora di inizio reale della seduta
      twin.start = a.start;
      twin.avgHr ??= a.avgHr;
      twin.maxHr ??= a.maxHr;
      twin.distanceKm ??= a.distanceKm;
      twin.calories ??= a.calories;
      twin.durationMin ??= a.durationMin;
    } else keptApple.push(a);
  }
  return sortWorkouts([...motra, ...keptApple]);
}

export function workoutCategory(w: Workout): "strength" | "cardio" | "other" {
  if (w.exercises?.length || /forza|strength|core/i.test(w.type ?? "")) return "strength";
  if (/corsa|run|camminat|walk|cicl|bici|bike|nuoto|swim|escursion|ellittic|canottagg|row|cardio|hiit/i.test(`${w.type ?? ""} ${w.name}`)) return "cardio";
  return "other";
}

/**
 * Due registrazioni sono la stessa seduta se iniziano entro 15 minuti, oppure se i loro
 * intervalli si toccano/sovrappongono (±5 min) e il tipo di attività è compatibile.
 * Serve perché il dettaglio Motra può riportare l'ora di fine mentre Apple Salute quella di inizio.
 */
export function sameSession(a: Workout, b: Workout): boolean {
  const as = new Date(a.start).getTime(), bs = new Date(b.start).getTime();
  if (Math.abs(as - bs) < 15 * 60000) return true;
  const ae = as + (a.durationMin ?? 0) * 60000, be = bs + (b.durationMin ?? 0) * 60000;
  const tol = 5 * 60000;
  const overlap = as <= be + tol && bs <= ae + tol;
  const ca = workoutCategory(a), cb = workoutCategory(b);
  return overlap && (ca === cb || ca === "other" || cb === "other");
}

export interface ExerciseIndexItem {
  id: string;
  name: string;
  sessions: number;
  lastDate: string;
}

export function exerciseIndex(workouts: Workout[]): ExerciseIndexItem[] {
  const m = new Map<string, ExerciseIndexItem>();
  for (const w of workouts) {
    for (const e of w.exercises ?? []) {
      const it = m.get(e.id) ?? { id: e.id, name: e.name, sessions: 0, lastDate: "" };
      it.sessions++;
      if (w.start > it.lastDate) it.lastDate = w.start;
      m.set(e.id, it);
    }
  }
  return [...m.values()].sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name));
}

export interface ExerciseSessionPoint {
  date: string;
  workoutId: string;
  topWeight?: number;
  e1rm?: number;
  volume: number;
  totalReps: number;
  sets: number;
  bestSet: string;
}

export function exerciseHistory(workouts: Workout[], exerciseId: string): ExerciseSessionPoint[] {
  const pts: ExerciseSessionPoint[] = [];
  for (const w of workouts) {
    for (const e of w.exercises ?? []) {
      if (e.id !== exerciseId) continue;
      const work = e.sets.filter((s) => !s.warmup);
      const weights = work.map((s) => s.weight).filter((x): x is number => !!x);
      const e1 = work.map(e1rm).filter((x): x is number => !!x);
      const best = [...work].sort((a, b) => (e1rm(b) ?? setVolume(b)) - (e1rm(a) ?? setVolume(a)))[0];
      pts.push({
        date: dayKey(w.start),
        workoutId: w.id,
        topWeight: weights.length ? Math.max(...weights) : undefined,
        e1rm: e1.length ? Math.round(Math.max(...e1) * 10) / 10 : undefined,
        volume: work.reduce((a, s) => a + setVolume(s), 0),
        totalReps: work.reduce((a, s) => a + (s.reps ?? 0), 0),
        sets: work.length,
        bestSet: best ? describeSet(best) : "",
      });
    }
  }
  return pts.sort((a, b) => a.date.localeCompare(b.date));
}

export function describeSet(s: SetEntry): string {
  const parts: string[] = [];
  if (s.reps !== undefined) parts.push(`${s.reps} rip`);
  if (s.timeSec !== undefined) parts.push(fmtDuration(s.timeSec));
  if (s.distanceM !== undefined) parts.push(`${s.distanceM} m`);
  parts.push(s.weight ? `@ ${fmtNum(s.weight, 1)} kg` : "@ corpo libero");
  if (s.rpe) parts.push(`RPE ${s.rpe}`);
  return parts.join(" ");
}

export function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? `${m}m${s ? pad(s) + "s" : ""}` : `${s}s`;
}

export function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
