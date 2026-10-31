// Modello dati unico dell'app: tutte le sorgenti (Motra, Apple Salute) vengono
// normalizzate in queste strutture.

export type Source = "motra" | "apple" | "manual";

export interface SetEntry {
  reps?: number;
  /** kg; undefined = corpo libero */
  weight?: number;
  timeSec?: number;
  distanceM?: number;
  rpe?: number;
  restSec?: number;
  warmup?: boolean;
}

export interface ExerciseEntry {
  /** id esercizio (es. "barbellRomanianDeadlift") o nome normalizzato */
  id: string;
  name: string;
  note?: string;
  sets: SetEntry[];
}

export interface Workout {
  id: string;
  source: Source;
  name: string;
  /** ISO 8601 locale, es. "2026-10-30T07:09:00" */
  start: string;
  durationMin?: number;
  calories?: number;
  distanceKm?: number;
  avgHr?: number;
  maxHr?: number;
  /** tipo attività (es. "Forza", "Corsa") */
  type?: string;
  muscleGroups?: string[];
  exercises?: ExerciseEntry[];
  notes?: string;
}

/** Metriche giornaliere di salute (chiave = YYYY-MM-DD) */
export interface DailyMetrics {
  hrv?: number; // ms (SDNN, media giornaliera)
  restingHr?: number; // bpm
  vo2max?: number; // ml/kg/min
  hrAvg?: number;
  hrMax?: number;
  walkingHr?: number;
  hrRecovery?: number; // bpm recuperati in 1 min
  steps?: number;
  activeKcal?: number;
  exerciseMin?: number;
  distanceKm?: number;
  sleepH?: number;
  sleepDeepH?: number;
  sleepRemH?: number;
  weight?: number; // kg
  bodyFat?: number; // %
  respRate?: number;
  spo2?: number; // %
}

export type MetricKey = keyof DailyMetrics;

export interface CoachComment {
  id: string;
  /** id allenamento commentato, oppure "week:YYYY-MM-DD" / "general" */
  target: string;
  createdAt: string;
  text: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface Settings {
  apiKey: string;
  model: string;
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  athleteProfile: string;
}

export interface AppData {
  workouts: Workout[];
  daily: Record<string, DailyMetrics>;
  comments: CoachComment[];
  chat: ChatMessage[];
  settings: Settings;
  lastImport?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  apiKey: "",
  model: "claude-opus-5-5",
  effort: "medium",
  athleteProfile: "",
};

export const EMPTY_DATA: AppData = {
  workouts: [],
  daily: {},
  comments: [],
  chat: [],
  settings: DEFAULT_SETTINGS,
};
