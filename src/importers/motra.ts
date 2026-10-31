// Import dei dati Motra.
// Formati accettati:
//  1. JSON nel formato dell'app ({ workouts: [...], daily?: {...} }) – vedi README
//  2. Testo nel formato di dettaglio Motra (quello restituito dal connettore Motra
//     per Claude: "Workout: … / Segment — main: / - Esercizio (id) (N sets): / set 1: 10 reps @ 60kg …")
import type { DailyMetrics, ExerciseEntry, SetEntry, Workout } from "../types";

export interface ImportResult {
  workouts: Workout[];
  daily: Record<string, DailyMetrics>;
}

export function importMotraFile(text: string, fileName = ""): ImportResult {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return importJson(JSON.parse(trimmed));
  if (/\.csv$/i.test(fileName)) return { workouts: importCsv(trimmed), daily: {} };
  return { workouts: parseMotraText(trimmed), daily: {} };
}

function importJson(j: unknown): ImportResult {
  const obj = (Array.isArray(j) ? { workouts: j } : j) as { workouts?: unknown[]; daily?: Record<string, DailyMetrics> };
  const workouts = (obj.workouts ?? []).map((raw, i) => normalizeWorkout(raw as Partial<Workout>, i));
  return { workouts, daily: obj.daily ?? {} };
}

function normalizeWorkout(w: Partial<Workout> & Record<string, unknown>, i: number): Workout {
  const start = String(w.start ?? w.date ?? w.timeStarted ?? "");
  if (!start) throw new Error(`Allenamento #${i + 1} senza data (campo "start")`);
  return {
    id: String(w.id ?? `motra_${start.replace(/\D/g, "")}`),
    source: (w.source as Workout["source"]) ?? "motra",
    name: String(w.name ?? "Allenamento"),
    start: start.length === 10 ? start + "T00:00:00" : start.slice(0, 19),
    durationMin: num(w.durationMin ?? w.duration),
    calories: num(w.calories),
    distanceKm: num(w.distanceKm),
    avgHr: num(w.avgHr),
    maxHr: num(w.maxHr),
    type: w.type ? String(w.type) : (w.exercises?.length ? "Forza" : undefined),
    muscleGroups: w.muscleGroups,
    notes: w.notes,
    exercises: (w.exercises ?? []).map((e) => ({
      id: String(e.id ?? slug(e.name)),
      name: String(e.name ?? e.id),
      note: e.note,
      sets: (e.sets ?? []).map((s) => ({ ...s })),
    })),
  };
}

const num = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : Number(v));
export const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

/** "1m44s" | "2min" | "8s" | "1h2m" → secondi */
function parseDur(s: string): number | undefined {
  let t = 0, ok = false;
  const re = /(\d+(?:[.,]\d+)?)\s*(h|min|m|s)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    ok = true;
    const v = parseFloat(m[1].replace(",", "."));
    t += m[2] === "h" ? v * 3600 : m[2] === "s" ? v : v * 60;
  }
  return ok ? Math.round(t) : undefined;
}

function to24(date: string, time: string, ampm?: string): string {
  let [h, mi] = time.split(":").map(Number);
  if (ampm) {
    const pm = ampm.toUpperCase() === "PM";
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  return `${date}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00`;
}

export function parseSetLine(body: string): SetEntry {
  const s: SetEntry = {};
  if (/\[warm-?up\]|riscaldamento/i.test(body)) s.warmup = true;
  const [main, ...rest] = body.replace(/\[[^\]]*\]/g, "").split(",");
  const [left, right] = main.split("@").map((x) => x?.trim());
  const reps = left?.match(/(\d+)\s*(reps?|rip)/i);
  if (reps) s.reps = +reps[1];
  const dist = left?.match(/(\d+(?:[.,]\d+)?)\s*(km|m)\b(?!in)/i);
  if (!reps && dist) s.distanceM = parseFloat(dist[1].replace(",", ".")) * (dist[2].toLowerCase() === "km" ? 1000 : 1);
  if (!reps && !dist && left) s.timeSec = parseDur(left);
  if (right && !/^BW|corpo/i.test(right)) {
    const w = right.match(/(-?\d+(?:[.,]\d+)?)\s*(kg|lbs?)?/i);
    if (w) s.weight = parseFloat(w[1].replace(",", ".")) * (w[2]?.toLowerCase().startsWith("lb") ? 0.45359237 : 1);
  }
  for (const r of rest) {
    if (/rest|recupero/i.test(r)) s.restSec = parseDur(r);
    const rpe = r.match(/RPE\s*(\d+(?:[.,]\d)?)/i);
    if (rpe) s.rpe = parseFloat(rpe[1].replace(",", "."));
  }
  const rpe = body.match(/RPE\s*(\d+(?:[.,]\d)?)/i);
  if (rpe) s.rpe = parseFloat(rpe[1].replace(",", "."));
  return s;
}

export function parseMotraText(text: string): Workout[] {
  const out: Workout[] = [];
  let w: Workout | null = null;
  let ex: ExerciseEntry | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^(?:Workout|Allenamento):\s*(.+?)(?:\s*\((?:workoutID|ID):\s*([^)]+)\))?$/i))) {
      w = { id: m[2] ? m[2].toLowerCase() : "", source: "motra", name: m[1], start: "", exercises: [] };
      out.push(w);
      ex = null;
    } else if (w && !w.start && (m = line.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*(AM|PM)?(.*)$/i))) {
      w.start = to24(m[1], m[2], m[3]);
      const dur = m[4].match(/\|\s*([\dhms ]+?)\s*\|/) ?? m[4].match(/\|\s*(\d+\s*(?:h|m|min)[\dms ]*)/);
      if (dur) w.durationMin = Math.round((parseDur(dur[1]) ?? 0) / 60) || undefined;
      const kcal = m[4].match(/(\d+)\s*kcal/);
      if (kcal) w.calories = +kcal[1];
    } else if (w && (m = line.match(/^-\s*(.+?)\s*(?:\(([^()]+)\))?\s*\((\d+)\s*(?:sets?|serie)\):?$/i))) {
      ex = { id: m[2] ?? slug(m[1]), name: m[1], sets: [] };
      w.exercises!.push(ex);
    } else if (ex && (m = line.match(/^(?:note|nota):\s*(.+)$/i))) {
      ex.note = m[1];
    } else if (ex && (m = line.match(/^(?:set|serie)\s*\d+:\s*(.+)$/i))) {
      ex.sets.push(parseSetLine(m[1]));
    }
  }
  for (const x of out) {
    if (!x.id) x.id = `motra_${x.start.replace(/\D/g, "")}`;
    x.type = x.exercises?.length ? "Forza" : x.type;
  }
  return out.filter((x) => x.start);
}

/** CSV semplice: date,workout,exercise,reps,weight[,rest,rpe,warmup] */
function importCsv(text: string): Workout[] {
  const rows = text.split(/\r?\n/).map((l) => l.split(/[;,]/).map((c) => c.trim().replace(/^"|"$/g, "")));
  const header = rows.shift()!.map((h) => h.toLowerCase());
  const col = (names: string[]) => header.findIndex((h) => names.includes(h));
  const iDate = col(["date", "data"]), iW = col(["workout", "allenamento"]), iE = col(["exercise", "esercizio"]);
  const iR = col(["reps", "ripetizioni"]), iKg = col(["weight", "peso", "kg"]), iRest = col(["rest", "recupero"]);
  const iRpe = col(["rpe"]), iWu = col(["warmup", "riscaldamento"]);
  if (iDate < 0 || iE < 0) throw new Error("CSV: servono almeno le colonne date ed exercise");
  const byKey = new Map<string, Workout>();
  for (const r of rows) {
    if (!r[iDate]) continue;
    const start = r[iDate].length === 10 ? r[iDate] + "T00:00:00" : r[iDate].replace(" ", "T").slice(0, 19);
    const key = `${start}|${iW >= 0 ? r[iW] : ""}`;
    const w = byKey.get(key) ?? { id: `csv_${start.replace(/\D/g, "")}`, source: "motra" as const, name: (iW >= 0 && r[iW]) || "Allenamento", start, type: "Forza", exercises: [] };
    byKey.set(key, w);
    const name = r[iE];
    let ex = w.exercises!.find((e) => e.name === name);
    if (!ex) { ex = { id: slug(name), name, sets: [] }; w.exercises!.push(ex); }
    ex.sets.push({
      reps: iR >= 0 ? num(r[iR]) : undefined,
      weight: iKg >= 0 ? num(r[iKg]) || undefined : undefined,
      restSec: iRest >= 0 ? num(r[iRest]) : undefined,
      rpe: iRpe >= 0 ? num(r[iRpe]) : undefined,
      warmup: iWu >= 0 ? /^(1|true|si|sì|yes)$/i.test(r[iWu]) : undefined,
    });
  }
  return [...byKey.values()];
}
