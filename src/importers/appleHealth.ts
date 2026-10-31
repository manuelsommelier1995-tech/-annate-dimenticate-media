// Parser in streaming dell'esportazione di Apple Salute (export.xml / esportazione.xml,
// anche dentro lo ZIP). Non costruisce il DOM: scansiona il testo cercando i tag
// <Record> e <Workout>, così regge file da diversi GB.
import type { DailyMetrics, Workout } from "../types";

type Agg = { sum: number; n: number; max: number; last: number; lastT: string };

const ATTR_RE = /(\w+)="([^"]*)"/g;
function attrs(tag: string): Record<string, string> {
  const o: Record<string, string> = {};
  ATTR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ATTR_RE.exec(tag))) o[m[1]] = m[2];
  return o;
}

/** "2024-01-02 07:10:00 +0100" → "2024-01-02T07:10:00" (ora locale del record) */
const localIso = (s: string) => s.slice(0, 10) + "T" + s.slice(11, 19);
/** → millisecondi epoch */
function epoch(s: string): number {
  const tz = s.slice(20).trim(); // +0100
  const iso = `${s.slice(0, 10)}T${s.slice(11, 19)}${tz ? tz.slice(0, 3) + ":" + tz.slice(3) : ""}`;
  return Date.parse(iso);
}

const HK = "HKQuantityTypeIdentifier";
type Mode = "avg" | "last" | "max" | "sumBySource";
const QUANTITY: Record<string, { field: keyof DailyMetrics; mode: Mode; conv?: (v: number, unit: string) => number }> = {
  [HK + "HeartRateVariabilitySDNN"]: { field: "hrv", mode: "avg" },
  [HK + "RestingHeartRate"]: { field: "restingHr", mode: "avg" },
  [HK + "VO2Max"]: { field: "vo2max", mode: "last" },
  [HK + "HeartRate"]: { field: "hrAvg", mode: "avg" },
  [HK + "WalkingHeartRateAverage"]: { field: "walkingHr", mode: "avg" },
  [HK + "HeartRateRecoveryOneMinute"]: { field: "hrRecovery", mode: "avg" },
  [HK + "StepCount"]: { field: "steps", mode: "sumBySource" },
  [HK + "ActiveEnergyBurned"]: { field: "activeKcal", mode: "sumBySource", conv: (v, u) => (u === "kJ" ? v / 4.184 : v) },
  [HK + "AppleExerciseTime"]: { field: "exerciseMin", mode: "sumBySource" },
  [HK + "DistanceWalkingRunning"]: { field: "distanceKm", mode: "sumBySource", conv: (v, u) => (u === "mi" ? v * 1.609344 : u === "m" ? v / 1000 : v) },
  [HK + "BodyMass"]: { field: "weight", mode: "last", conv: (v, u) => (u === "lb" ? v * 0.45359237 : v) },
  [HK + "BodyFatPercentage"]: { field: "bodyFat", mode: "last", conv: (v) => (v <= 1 ? v * 100 : v) },
  [HK + "RespiratoryRate"]: { field: "respRate", mode: "avg" },
  [HK + "OxygenSaturation"]: { field: "spo2", mode: "avg", conv: (v) => (v <= 1 ? v * 100 : v) },
};

const SLEEP_ASLEEP = new Set([
  "HKCategoryValueSleepAnalysisAsleep",
  "HKCategoryValueSleepAnalysisAsleepCore",
  "HKCategoryValueSleepAnalysisAsleepDeep",
  "HKCategoryValueSleepAnalysisAsleepREM",
  "HKCategoryValueSleepAnalysisAsleepUnspecified",
]);

const ACTIVITY_IT: Record<string, string> = {
  Running: "Corsa", Walking: "Camminata", Cycling: "Ciclismo", Swimming: "Nuoto",
  TraditionalStrengthTraining: "Forza", FunctionalStrengthTraining: "Forza funzionale",
  HighIntensityIntervalTraining: "HIIT", Yoga: "Yoga", Hiking: "Escursione", Rowing: "Canottaggio",
  Elliptical: "Ellittica", CoreTraining: "Core", Flexibility: "Mobilità", CrossTraining: "Cross training",
  StairClimbing: "Scale", MixedCardio: "Cardio misto", Pilates: "Pilates", Soccer: "Calcio",
  Tennis: "Tennis", Padel: "Padel", Boxing: "Boxe", Dance: "Danza", Cooldown: "Defaticamento",
  JumpRope: "Salto della corda", Other: "Altro",
};

export interface AppleParseResult {
  daily: Record<string, DailyMetrics>;
  workouts: Workout[];
  records: number;
}

export class AppleHealthParser {
  private buf = "";
  private agg = new Map<string, Agg>(); // `${day}|${field}` o `${day}|${field}|${source}`
  private sleep = new Map<string, { total: number; deep: number; rem: number }>(); // `${day}|${source}`
  private workouts: Workout[] = [];
  records = 0;

  push(text: string) {
    this.buf += text;
    this.drain();
  }

  private drain() {
    const b = this.buf;
    let pos = 0;
    for (;;) {
      const r = b.indexOf("<Record ", pos);
      const w = b.indexOf("<Workout ", pos);
      const next = r === -1 ? w : w === -1 ? r : Math.min(r, w);
      if (next === -1) {
        pos = Math.max(pos, b.length - 16);
        break;
      }
      const tagEnd = b.indexOf(">", next);
      if (tagEnd === -1) { pos = next; break; }
      if (next === w) {
        if (b[tagEnd - 1] === "/") {
          this.workout(b.slice(next, tagEnd));
          pos = tagEnd + 1;
          continue;
        }
        const end = b.indexOf("</Workout>", tagEnd);
        if (end === -1) { pos = next; break; }
        this.workout(b.slice(next, end));
        pos = end + 10;
      } else {
        this.record(b.slice(next, tagEnd));
        pos = tagEnd + 1;
      }
    }
    this.buf = b.slice(pos);
  }

  private acc(key: string, v: number, t: string) {
    const a = this.agg.get(key);
    if (!a) this.agg.set(key, { sum: v, n: 1, max: v, last: v, lastT: t });
    else {
      a.sum += v; a.n++;
      if (v > a.max) a.max = v;
      if (t >= a.lastT) { a.last = v; a.lastT = t; }
    }
  }

  private record(tag: string) {
    const typeStart = tag.indexOf('type="') + 6;
    const type = tag.slice(typeStart, tag.indexOf('"', typeStart));
    const isSleep = type === "HKCategoryTypeIdentifierSleepAnalysis";
    const q = QUANTITY[type];
    if (!q && !isSleep) return;
    const a = attrs(tag);
    this.records++;
    if (isSleep) {
      if (!SLEEP_ASLEEP.has(a.value)) return;
      const h = (epoch(a.endDate) - epoch(a.startDate)) / 3600000;
      if (!(h > 0) || h > 24) return;
      const key = `${a.endDate.slice(0, 10)}|${a.sourceName ?? ""}`;
      const s = this.sleep.get(key) ?? { total: 0, deep: 0, rem: 0 };
      s.total += h;
      if (a.value.endsWith("Deep")) s.deep += h;
      if (a.value.endsWith("REM")) s.rem += h;
      this.sleep.set(key, s);
      return;
    }
    let v = parseFloat(a.value);
    if (Number.isNaN(v)) return;
    if (q.conv) v = q.conv(v, a.unit ?? "");
    const day = a.startDate.slice(0, 10);
    if (q.mode === "sumBySource") this.acc(`${day}|${q.field}|${a.sourceName ?? ""}`, v, a.startDate);
    else this.acc(`${day}|${q.field}`, v, a.startDate);
    if (q.field === "hrAvg") this.acc(`${day}|hrMax`, v, a.startDate);
  }

  private workout(block: string) {
    const open = block.slice(0, block.indexOf(">") + 1);
    const a = attrs(open);
    if (!a.startDate) return;
    const typeKey = (a.workoutActivityType ?? "").replace("HKWorkoutActivityType", "");
    const w: Workout = {
      id: `apple_${a.startDate.replace(/\D/g, "")}_${typeKey}`,
      source: "apple",
      type: ACTIVITY_IT[typeKey] ?? typeKey,
      name: `${ACTIVITY_IT[typeKey] ?? typeKey}${a.sourceName ? ` (${a.sourceName})` : ""}`,
      start: localIso(a.startDate),
    };
    const dur = parseFloat(a.duration);
    if (!Number.isNaN(dur)) w.durationMin = a.durationUnit === "s" ? dur / 60 : a.durationUnit === "h" ? dur * 60 : dur;
    else if (a.endDate) w.durationMin = (epoch(a.endDate) - epoch(a.startDate)) / 60000;
    const dist = parseFloat(a.totalDistance);
    if (dist) w.distanceKm = a.totalDistanceUnit === "mi" ? dist * 1.609344 : a.totalDistanceUnit === "m" ? dist / 1000 : dist;
    const kcal = parseFloat(a.totalEnergyBurned);
    if (kcal) w.calories = a.totalEnergyBurnedUnit === "kJ" ? kcal / 4.184 : kcal;
    // statistiche (export iOS 16+)
    const stRe = /<WorkoutStatistics ([^>]*)>/g;
    let m: RegExpExecArray | null;
    while ((m = stRe.exec(block))) {
      const s = attrs(m[1]);
      if (s.type === HK + "HeartRate") {
        if (s.average) w.avgHr = Math.round(parseFloat(s.average));
        if (s.maximum) w.maxHr = Math.round(parseFloat(s.maximum));
      } else if (s.type === HK + "ActiveEnergyBurned" && !w.calories && s.sum) {
        w.calories = s.unit === "kJ" ? parseFloat(s.sum) / 4.184 : parseFloat(s.sum);
      } else if (/Distance/.test(s.type ?? "") && !w.distanceKm && s.sum) {
        const v = parseFloat(s.sum);
        w.distanceKm = s.unit === "mi" ? v * 1.609344 : s.unit === "m" ? v / 1000 : v;
      }
    }
    if (w.calories) w.calories = Math.round(w.calories);
    if (w.durationMin) w.durationMin = Math.round(w.durationMin);
    if (w.distanceKm) w.distanceKm = Math.round(w.distanceKm * 100) / 100;
    this.workouts.push(w);
  }

  finish(): AppleParseResult {
    this.drain();
    const daily: Record<string, DailyMetrics> = {};
    const d = (day: string) => (daily[day] ??= {});
    const round = (v: number, digits: number) => Math.round(v * 10 ** digits) / 10 ** digits;
    // somme: per ogni giorno prendo la sorgente con il totale più alto (evita doppio conteggio iPhone + Watch)
    const sums = new Map<string, number>();
    for (const [key, a] of this.agg) {
      const parts = key.split("|");
      const [day, field] = parts;
      if (parts.length === 3) {
        const k = `${day}|${field}`;
        sums.set(k, Math.max(sums.get(k) ?? 0, a.sum));
        continue;
      }
      const q = Object.values(QUANTITY).find((x) => x.field === field);
      const f = field as keyof DailyMetrics;
      if (field === "hrMax") d(day).hrMax = Math.round(a.max);
      else if (q?.mode === "last") d(day)[f] = round(a.last, 1);
      else d(day)[f] = round(a.sum / a.n, 1);
    }
    for (const [k, v] of sums) {
      const [day, field] = k.split("|");
      d(day)[field as keyof DailyMetrics] = field === "distanceKm" ? round(v, 2) : Math.round(v);
    }
    const sleepBest = new Map<string, { total: number; deep: number; rem: number }>();
    for (const [k, s] of this.sleep) {
      const day = k.split("|")[0];
      if ((sleepBest.get(day)?.total ?? 0) < s.total) sleepBest.set(day, s);
    }
    for (const [day, s] of sleepBest) {
      d(day).sleepH = round(s.total, 2);
      if (s.deep) d(day).sleepDeepH = round(s.deep, 2);
      if (s.rem) d(day).sleepRemH = round(s.rem, 2);
    }
    return { daily, workouts: this.workouts, records: this.records };
  }
}
