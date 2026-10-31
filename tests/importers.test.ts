import { describe, expect, it } from "vitest";
import { parseMotraText, importMotraFile } from "../src/importers/motra";
import { AppleHealthParser } from "../src/importers/appleHealth";
import { mergeWorkouts, exerciseHistory, e1rm } from "../src/lib/util";
import { setsCsv, workoutsIcs } from "../src/lib/exporters";
import { EMPTY_DATA } from "../src/types";

const MOTRA = `Workout: Venerdì Mattina Allenamento (workoutID: D724D385-67AE-4C8E-9C43-5EE57D6E9C35)
2026-10-30 07:52 AM | 43m | 177 kcal

Segment — main:
  - Barbell Romanian Deadlift (barbellRomanianDeadlift) (4 sets):
    set 1: 10 reps @ 20kg [warmup]
    set 2: 8 reps @ 60kg, 1m44s rest
    set 3: 6 reps @ 60kg, 2m10s rest
    → exercise volume: 1520kg
  - Side Plank with Hip Abduction (sidePlankWithHipAbduction) (2 sets):
    set 1: 8 reps @ BW, 5m31s rest
  - Dumbbell Jump Squat (dumbbellJumpSquat) (3 sets):
    note: Pogo jump
    set 1: 15 reps @ BW, 2min rest
    set 2: 15 reps @ BW, 8s rest
  - Plank (plank) (1 sets):
    set 1: 45s @ BW
Total workout volume: 4640kg

Workout: Corsa mercoledì sera (workoutID: 4ee24937)
2026-10-28 08:08 PM | 40m | 431 kcal`;

describe("Motra text parser", () => {
  const ws = parseMotraText(MOTRA);
  it("parses workouts, header and exercises", () => {
    expect(ws).toHaveLength(2);
    const w = ws[0];
    expect(w.id).toBe("d724d385-67ae-4c8e-9c43-5ee57d6e9c35");
    expect(w.start).toBe("2026-10-30T07:52:00");
    expect(w.durationMin).toBe(43);
    expect(w.calories).toBe(177);
    expect(w.exercises!.map((e) => e.id)).toEqual(["barbellRomanianDeadlift", "sidePlankWithHipAbduction", "dumbbellJumpSquat", "plank"]);
    expect(ws[1].start).toBe("2026-10-28T20:08:00");
  });
  it("parses sets", () => {
    const [rdl, plank, jump, hold] = ws[0].exercises!;
    expect(rdl.sets[0]).toEqual({ reps: 10, weight: 20, warmup: true });
    expect(rdl.sets[1]).toEqual({ reps: 8, weight: 60, restSec: 104 });
    expect(plank.sets[0]).toEqual({ reps: 8, restSec: 331 });
    expect(jump.note).toBe("Pogo jump");
    expect(jump.sets[0].restSec).toBe(120);
    expect(jump.sets[1].restSec).toBe(8);
    expect(hold.sets[0]).toEqual({ timeSec: 45 });
  });
  it("accepts JSON and CSV", () => {
    const j = importMotraFile(JSON.stringify({ workouts: [{ id: "a", name: "X", start: "2026-10-01T07:00:00", exercises: [{ id: "squat", name: "Squat", sets: [{ reps: 5, weight: 100 }] }] }] }));
    expect(j.workouts[0].exercises![0].sets[0].weight).toBe(100);
    const c = importMotraFile("date,workout,exercise,reps,weight\n2026-10-01,Gambe,Squat,5,100\n2026-10-01,Gambe,Squat,5,105", "x.csv");
    expect(c.workouts).toHaveLength(1);
    expect(c.workouts[0].exercises![0].sets).toHaveLength(2);
  });
});

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<HealthData locale="it_IT">
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Watch" unit="ms" startDate="2026-10-29 03:10:00 +0100" endDate="2026-10-29 03:11:00 +0100" value="50">
  <HeartRateVariabilityMetadataList></HeartRateVariabilityMetadataList>
 </Record>
 <Record type="HKQuantityTypeIdentifierHeartRateVariabilitySDNN" sourceName="Watch" unit="ms" startDate="2026-10-29 07:10:00 +0100" endDate="2026-10-29 07:11:00 +0100" value="60"/>
 <Record type="HKQuantityTypeIdentifierVO2Max" sourceName="Watch" unit="mL/min·kg" startDate="2026-10-29 20:00:00 +0100" endDate="2026-10-29 20:00:00 +0100" value="45.3"/>
 <Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="Watch" unit="count/min" startDate="2026-10-29 00:00:00 +0100" endDate="2026-10-29 23:59:00 +0100" value="55"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-10-29 10:00:00 +0100" endDate="2026-10-29 10:10:00 +0100" value="1000"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" startDate="2026-10-29 11:00:00 +0100" endDate="2026-10-29 11:10:00 +0100" value="500"/>
 <Record type="HKQuantityTypeIdentifierStepCount" sourceName="Watch" unit="count" startDate="2026-10-29 10:00:00 +0100" endDate="2026-10-29 10:10:00 +0100" value="1400"/>
 <Record type="HKQuantityTypeIdentifierBodyFatPercentage" sourceName="Bilancia" unit="%" startDate="2026-10-29 07:00:00 +0100" endDate="2026-10-29 07:00:00 +0100" value="0.18"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-29 23:30:00 +0100" endDate="2026-10-30 03:30:00 +0100" value="HKCategoryValueSleepAnalysisAsleepCore"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-30 03:30:00 +0100" endDate="2026-10-30 05:00:00 +0100" value="HKCategoryValueSleepAnalysisAsleepDeep"/>
 <Record type="HKCategoryTypeIdentifierSleepAnalysis" sourceName="Watch" startDate="2026-10-29 23:00:00 +0100" endDate="2026-10-30 06:00:00 +0100" value="HKCategoryValueSleepAnalysisInBed"/>
 <Workout workoutActivityType="HKWorkoutActivityTypeRunning" duration="40.5" durationUnit="min" sourceName="Apple Watch" startDate="2026-10-28 20:09:00 +0100" endDate="2026-10-28 20:49:00 +0100">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="x" endDate="y" average="152.4" minimum="90" maximum="178" unit="count/min"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" startDate="x" endDate="y" sum="431" unit="kcal"/>
  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" startDate="x" endDate="y" sum="7.2" unit="km"/>
 </Workout>
 <Workout workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" duration="43" durationUnit="min" sourceName="Motra" startDate="2026-10-30 07:09:00 +0100" endDate="2026-10-30 07:52:00 +0100">
  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" startDate="x" endDate="y" average="118" maximum="160" unit="count/min"/>
 </Workout>
</HealthData>`;

describe("Apple Health parser", () => {
  // simula lo streaming spezzando il file in pezzi piccoli
  const p = new AppleHealthParser();
  for (let i = 0; i < XML.length; i += 37) p.push(XML.slice(i, i + 37));
  const r = p.finish();
  it("aggregates daily metrics", () => {
    const d = r.daily["2026-10-29"];
    expect(d.hrv).toBe(55);
    expect(d.vo2max).toBe(45.3);
    expect(d.restingHr).toBe(55);
    expect(d.steps).toBe(1500); // sorgente con totale maggiore, niente doppio conteggio
    expect(d.bodyFat).toBe(18);
    expect(r.daily["2026-10-30"].sleepH).toBe(5.5); // InBed escluso
    expect(r.daily["2026-10-30"].sleepDeepH).toBe(1.5);
  });
  it("parses workouts with statistics", () => {
    expect(r.workouts).toHaveLength(2);
    const run = r.workouts[0];
    expect(run.type).toBe("Corsa");
    expect(run.start).toBe("2026-10-28T20:09:00");
    expect(run.avgHr).toBe(152);
    expect(run.calories).toBe(431);
    expect(run.distanceKm).toBe(7.2);
  });
  it("merges Apple duplicates into Motra workouts", () => {
    // il dettaglio Motra riporta 07:52 (fine), Apple 07:09 (inizio): devono fondersi
    const merged = mergeWorkouts(parseMotraText(MOTRA), r.workouts);
    // la forza Apple (07:09) si fonde con quella Motra; la corsa Motra (20:08) assorbe la corsa Apple (20:09)
    expect(merged).toHaveLength(2);
    const strength = merged.find((w) => w.id.startsWith("d724"))!;
    expect(strength.avgHr).toBe(118);
    expect(strength.start).toBe("2026-10-30T07:09:00");
    expect(merged.find((w) => w.id === "4ee24937")!.distanceKm).toBe(7.2);
  });
});

describe("sameSession", () => {
  const base = { source: "motra" as const, name: "x" };
  it("does not merge back-to-back different activities", () => {
    const lift = { ...base, id: "a", start: "2026-10-30T07:00:00", durationMin: 45, exercises: [{ id: "s", name: "S", sets: [] }] };
    const run = { ...base, id: "b", source: "apple" as const, name: "Corsa", type: "Corsa", start: "2026-10-30T07:46:00", durationMin: 30 };
    expect(mergeWorkouts([lift], [run])).toHaveLength(2);
  });
});

describe("stats & export", () => {
  const ws = parseMotraText(MOTRA);
  it("computes exercise history", () => {
    const h = exerciseHistory(ws, "barbellRomanianDeadlift");
    expect(h[0].topWeight).toBe(60);
    expect(h[0].volume).toBe(60 * 8 + 60 * 6);
    expect(h[0].e1rm).toBe(76);
    expect(e1rm({ reps: 10, weight: 20, warmup: true })).toBeUndefined();
  });
  it("exports CSV and ICS", () => {
    const csv = setsCsv(ws);
    expect(csv.split("\n")).toHaveLength(1 + 7);
    const ics = workoutsIcs(ws, EMPTY_DATA);
    expect(ics).toContain("DTSTART:20261030T075200");
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.split("\r\n").every((l) => l.length <= 75)).toBe(true);
  });
});
