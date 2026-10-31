// Dati dimostrativi per provare l'app senza importare nulla.
import type { DailyMetrics, ExerciseEntry, Workout } from "../types";
import { addDays, todayKey } from "./util";

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function demoData(): { workouts: Workout[]; daily: Record<string, DailyMetrics> } {
  const rand = rng(42);
  const today = todayKey();
  const days = 84;
  const workouts: Workout[] = [];
  const daily: Record<string, DailyMetrics> = {};
  const lower = [
    { id: "barbellBackSquat", name: "Barbell Back Squat", base: 70, reps: 6 },
    { id: "barbellRomanianDeadlift", name: "Barbell Romanian Deadlift", base: 50, reps: 8 },
    { id: "legCurl", name: "Leg / Hamstring Curl Seated", base: 35, reps: 10 },
  ];
  const upper = [
    { id: "barbellBenchPress", name: "Barbell Bench Press", base: 55, reps: 6 },
    { id: "pullUp", name: "Pull Up", base: 0, reps: 8 },
    { id: "dumbbellShoulderPress", name: "Dumbbell Shoulder Press", base: 16, reps: 10 },
  ];
  for (let i = days; i >= 0; i--) {
    const d = addDays(today, -i);
    const dow = (new Date(d + "T12:00:00").getDay() + 6) % 7; // 0 = lun
    const progress = (days - i) / days;
    const fatigue = dow === 3 || dow === 4 ? 1 : 0;
    daily[d] = {
      hrv: Math.round(52 + progress * 6 - fatigue * 6 + (rand() - 0.5) * 14),
      restingHr: Math.round(56 - progress * 2 + fatigue * 2 + (rand() - 0.5) * 4),
      sleepH: Math.round((7 + (rand() - 0.5) * 1.8) * 100) / 100,
      steps: Math.round(7000 + rand() * 6000),
      activeKcal: Math.round(450 + rand() * 350),
      exerciseMin: Math.round(20 + rand() * 50),
      weight: Math.round((78.5 - progress * 1.5 + (rand() - 0.5) * 0.6) * 10) / 10,
      ...(i % 6 === 0 ? { vo2max: Math.round((44 + progress * 2.2 + (rand() - 0.5)) * 10) / 10 } : {}),
    };
    const plan = dow === 0 || dow === 4 ? lower : dow === 1 || dow === 5 ? upper : null;
    if (plan && rand() > 0.12) {
      const exercises: ExerciseEntry[] = plan.map((p) => {
        const w = p.base ? Math.round((p.base * (1 + progress * 0.15)) / 2.5) * 2.5 : 0;
        return {
          id: p.id,
          name: p.name,
          sets: [
            ...(p.base ? [{ reps: 10, weight: Math.round(w * 0.5), warmup: true }] : []),
            ...[0, 1, 2].map(() => ({ reps: p.reps + Math.round((rand() - 0.6) * 2), weight: w || undefined, restSec: 90 + Math.round(rand() * 60) })),
          ],
        };
      });
      workouts.push({
        id: `demo_${d}`, source: "motra", name: plan === lower ? "Gambe e catena posteriore" : "Upper body",
        start: `${d}T07:${10 + Math.floor(rand() * 20)}:00`, durationMin: 45 + Math.round(rand() * 15),
        calories: 180 + Math.round(rand() * 60), type: "Forza", exercises,
        muscleGroups: plan === lower ? ["quads", "glutes", "hamstrings"] : ["chest", "lats", "shoulders"],
      });
    }
    if (dow === 2 || dow === 6) {
      const km = Math.round((5 + rand() * 4) * 100) / 100;
      workouts.push({
        id: `demo_run_${d}`, source: "apple", name: "Corsa (Apple Watch)", type: "Corsa",
        start: `${d}T19:${10 + Math.floor(rand() * 40)}:00`, durationMin: Math.round(km * 5.6),
        distanceKm: km, calories: Math.round(km * 68), avgHr: Math.round(148 + rand() * 10), maxHr: Math.round(170 + rand() * 10),
      });
    }
  }
  return { workouts, daily };
}
