// Coach AI basato su Claude (Anthropic API), chiamato direttamente dal browser
// con la chiave API dell'utente (salvata solo in locale).
import Anthropic from "@anthropic-ai/sdk";
import type { AppData, ChatMessage, Workout } from "../types";
import {
  addDays, avgOf, dayKey, describeSet, exerciseHistory, exerciseIndex, fmtNum, metricMeta,
  sortWorkouts, todayKey, workoutSets, workoutVolume,
} from "./util";
import type { MetricKey } from "../types";

const SYSTEM_PROMPT = `Sei un coach di forza e condizionamento esperto e un appassionato di fisiologia dell'allenamento. Parli in italiano, in modo diretto, concreto e motivante, come un buon personal trainer che conosce bene il suo atleta.

Ricevi i dati reali dell'atleta: allenamenti registrati con Motra (esercizi, serie, ripetizioni, carichi, recuperi), allenamenti cardio e metriche di salute da Apple Salute (HRV, FC a riposo, VO2max, sonno, passi, peso, ecc.).

Come lavori:
- Basa ogni osservazione sui numeri forniti; cita i valori (es. "RDL 60 kg x 8, +5 kg rispetto a 3 settimane fa"). Se un dato manca, dillo invece di inventarlo.
- Collega carico di allenamento e recupero: HRV sotto la propria media e FC a riposo sopra la media, insieme a poco sonno, indicano recupero incompleto.
- Valuta progressione (1RM stimato, volume, ripetizioni), equilibrio tra gruppi muscolari, frequenza, recuperi tra le serie e coerenza con gli obiettivi dell'atleta.
- Dai indicazioni pratiche e specifiche per le prossime sedute (carichi, serie, ripetizioni, scarico, mobilità, cardio).
- Usa titoletti brevi ed elenchi puntati in Markdown. Sii conciso: preferisci 3 consigli utili a 10 generici.
- Non fai diagnosi mediche: se un dato è anomalo in modo preoccupante (es. FC a riposo molto alta per giorni), suggerisci di sentire un medico.`;

const r1 = (n?: number, d = 0) => (n === undefined ? "–" : fmtNum(n, d));

function workoutLine(w: Workout, detailed: boolean): string {
  const head = [
    `${w.start.slice(0, 16).replace("T", " ")} | ${w.name}`,
    w.type, w.durationMin && `${w.durationMin} min`, w.calories && `${w.calories} kcal`,
    w.distanceKm && `${fmtNum(w.distanceKm, 2)} km`, w.avgHr && `FC media ${w.avgHr}`, w.maxHr && `FC max ${w.maxHr}`,
    workoutVolume(w) && `volume ${fmtNum(workoutVolume(w))} kg`, workoutSets(w) && `${workoutSets(w)} serie`,
    w.muscleGroups?.length && `muscoli: ${w.muscleGroups.join(", ")}`,
  ].filter(Boolean).join(" | ");
  if (!detailed || !w.exercises?.length) return `- ${head}`;
  const ex = w.exercises
    .map((e) => `    • ${e.name}${e.note ? ` (nota: ${e.note})` : ""}: ${e.sets.map((s) => `${describeSet(s)}${s.warmup ? " [risc.]" : ""}${s.restSec ? `, rec ${s.restSec}s` : ""}`).join(" | ")}`)
    .join("\n");
  return `- ${head}\n${ex}`;
}

const KEY_METRICS: MetricKey[] = ["hrv", "restingHr", "sleepH", "vo2max", "steps", "activeKcal", "weight", "respRate"];

/** Riassunto testuale dei dati per il modello */
export function buildContext(data: AppData, opts: { days?: number; focusWorkoutId?: string } = {}): string {
  const days = opts.days ?? 42;
  const today = todayKey();
  const from = addDays(today, -days);
  const ws = sortWorkouts(data.workouts).filter((w) => dayKey(w.start) >= from).reverse();
  const parts: string[] = [`Oggi è ${today}.`];
  if (data.settings.athleteProfile.trim()) parts.push(`## Profilo e obiettivi dell'atleta\n${data.settings.athleteProfile.trim()}`);

  // salute: ultimi 14 giorni giorno per giorno + medie 7/30/90 gg
  const hp: string[] = [];
  for (const k of KEY_METRICS) {
    const m = metricMeta(k);
    const vals = (a: number, b: number) =>
      avgOf(Object.keys(data.daily).filter((d) => d > addDays(today, -a) && d <= addDays(today, -b)).map((d) => data.daily[d][k]));
    const a7 = vals(7, 0), a30 = vals(30, 0), a90 = vals(90, 0);
    if (a7 === undefined && a30 === undefined && a90 === undefined) continue;
    hp.push(`- ${m.label} (${m.unit || "n"}): media 7gg ${r1(a7, m.digits)}, 30gg ${r1(a30, m.digits)}, 90gg ${r1(a90, m.digits)}`);
  }
  if (hp.length) {
    const rows: string[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = addDays(today, -i);
      const dm = data.daily[d];
      if (!dm) continue;
      rows.push(`${d}: ` + KEY_METRICS.filter((k) => dm[k] !== undefined).map((k) => `${metricMeta(k).label} ${r1(dm[k], metricMeta(k).digits)}`).join(", "));
    }
    parts.push(`## Metriche di salute (Apple Salute)\n${hp.join("\n")}${rows.length ? `\n\nUltimi 14 giorni:\n${rows.join("\n")}` : ""}`);
  }

  // allenamenti
  if (ws.length) {
    const detailedFrom = addDays(today, -21);
    parts.push(
      `## Allenamenti ultimi ${days} giorni (${ws.length})\n` +
        ws.map((w) => workoutLine(w, dayKey(w.start) >= detailedFrom || w.id === opts.focusWorkoutId)).join("\n"),
    );
  } else parts.push("## Allenamenti\nNessun allenamento registrato nel periodo.");

  // progressione esercizi principali (tutto lo storico)
  const idx = exerciseIndex(data.workouts).slice(0, 12);
  const prog = idx
    .map((e) => {
      const h = exerciseHistory(data.workouts, e.id);
      const last = h[h.length - 1];
      const best = h.reduce((b, p) => ((p.e1rm ?? 0) > (b?.e1rm ?? 0) ? p : b), h[0]);
      const ago = [...h].reverse().find((p) => p.date <= addDays(last.date, -28));
      return `- ${e.name}: ${h.length} sedute; ultima ${last.date} (migliore serie ${last.bestSet}, 1RM stim. ${r1(last.e1rm, 1)} kg, volume ${r1(last.volume)} kg)` +
        `${ago ? `; 4+ settimane prima: 1RM stim. ${r1(ago.e1rm, 1)} kg` : ""}${best?.e1rm ? `; record 1RM stim. ${r1(best.e1rm, 1)} kg (${best.date})` : ""}`;
    })
    .join("\n");
  if (prog) parts.push(`## Progressione esercizi principali\n${prog}`);

  if (opts.focusWorkoutId) {
    const w = data.workouts.find((x) => x.id === opts.focusWorkoutId);
    if (w) {
      const dm = data.daily[dayKey(w.start)] ?? {};
      parts.push(`## Allenamento da commentare\n${workoutLine(w, true)}\nSalute quel giorno: HRV ${r1(dm.hrv)} ms, FC riposo ${r1(dm.restingHr)}, sonno ${r1(dm.sleepH, 1)} h`);
    }
  }
  return parts.join("\n\n");
}

export interface AskOptions {
  data: AppData;
  messages: ChatMessage[];
  focusWorkoutId?: string;
  onText?: (delta: string, full: string) => void;
  signal?: AbortSignal;
}

export async function askCoach({ data, messages, focusWorkoutId, onText, signal }: AskOptions): Promise<string> {
  const { apiKey, model, effort } = data.settings;
  if (!apiKey) throw new Error("Inserisci la tua chiave API Anthropic in Impostazioni per usare il coach.");
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const context = buildContext(data, { focusWorkoutId });
  const stream = client.beta.messages.stream(
    {
      model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      output_config: { effort },
      // se il modello rifiuta per un falso positivo dei filtri di sicurezza, l'API riprova su un modello alternativo
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: `# Dati dell'atleta\n\n${context}` },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    },
    { signal },
  );
  let full = "";
  stream.on("text", (delta) => {
    full += delta;
    onText?.(delta, full);
  });
  const final = await stream.finalMessage();
  if (final.stop_reason === "refusal") {
    throw new Error("Il modello ha rifiutato di rispondere a questa richiesta. Prova a riformularla.");
  }
  const text = final.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  if (final.stop_reason === "max_tokens") return text + "\n\n_(risposta troncata)_";
  return text;
}

export function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "Chiave API non valida. Controllala in Impostazioni.";
  if (e instanceof Anthropic.PermissionDeniedError) return "La chiave API non ha accesso a questo modello.";
  if (e instanceof Anthropic.RateLimitError) return "Troppe richieste o credito esaurito: riprova tra poco.";
  if (e instanceof Anthropic.APIUserAbortError) return "Richiesta annullata.";
  if (e instanceof Anthropic.APIConnectionError) return "Impossibile raggiungere l'API Anthropic (connessione assente?).";
  if (e instanceof Anthropic.APIError) return `Errore API (${e.status ?? "?"}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export const QUICK_PROMPTS = [
  { label: "Analizza la mia settimana", text: "Analizza gli allenamenti e il recupero degli ultimi 7 giorni rispetto alle settimane precedenti. Cosa è andato bene, cosa migliorare?" },
  { label: "Oggi mi alleno?", text: "In base a HRV, FC a riposo, sonno e carico degli ultimi giorni, quanto sono recuperato oggi? Che tipo di allenamento mi consigli e con che intensità?" },
  { label: "Progressione forza", text: "Come stanno progredendo i miei esercizi principali? Dove sono in stallo e come sbloccarli?" },
  { label: "Equilibrio muscolare", text: "Il mio volume è bilanciato tra i gruppi muscolari e tra spinta/tirata e anteriore/posteriore? Cosa manca?" },
  { label: "Piano prossima settimana", text: "Proponimi un piano per la prossima settimana (giorni, sedute, esercizi con serie x ripetizioni x carico) coerente con i miei dati e obiettivi." },
  { label: "VO₂max e cardio", text: "Commenta l'andamento del mio VO2max e del lavoro cardio. Come posso migliorarlo senza compromettere la forza?" },
];
