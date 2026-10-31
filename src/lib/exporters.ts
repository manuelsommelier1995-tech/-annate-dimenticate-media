import type { AppData, Workout } from "../types";
import { dayKey, describeSet, fmtDate, fmtNum, metricMeta, METRICS, workoutSets, workoutVolume } from "./util";

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\n");

export function filterRange(ws: Workout[], from?: string, to?: string) {
  return ws.filter((w) => (!from || dayKey(w.start) >= from) && (!to || dayKey(w.start) <= to));
}

/** Una riga per serie: perfetto per Excel / Numbers / Google Sheets */
export function setsCsv(ws: Workout[]): string {
  const rows: unknown[][] = [["data", "ora", "allenamento", "esercizio", "id_esercizio", "serie", "riscaldamento", "ripetizioni", "peso_kg", "tempo_s", "distanza_m", "rpe", "recupero_s", "volume_kg", "nota"]];
  for (const w of [...ws].sort((a, b) => a.start.localeCompare(b.start))) {
    for (const e of w.exercises ?? []) {
      e.sets.forEach((s, i) =>
        rows.push([dayKey(w.start), w.start.slice(11, 16), w.name, e.name, e.id, i + 1, s.warmup ? "sì" : "", s.reps, s.weight, s.timeSec, s.distanceM, s.rpe, s.restSec, (s.weight ?? 0) * (s.reps ?? 0) || "", e.note]),
      );
    }
  }
  return csv(rows);
}

/** Una riga per allenamento, con le metriche di salute di quel giorno */
export function workoutsCsv(data: AppData, ws: Workout[]): string {
  const rows: unknown[][] = [["data", "ora", "nome", "tipo", "fonte", "durata_min", "kcal", "distanza_km", "fc_media", "fc_max", "esercizi", "serie", "volume_kg", "gruppi_muscolari", "hrv_ms", "fc_riposo", "vo2max", "sonno_h"]];
  for (const w of [...ws].sort((a, b) => a.start.localeCompare(b.start))) {
    const d = data.daily[dayKey(w.start)] ?? {};
    rows.push([dayKey(w.start), w.start.slice(11, 16), w.name, w.type, w.source, w.durationMin, w.calories, w.distanceKm, w.avgHr, w.maxHr, w.exercises?.length ?? 0, workoutSets(w), workoutVolume(w) || "", (w.muscleGroups ?? []).join(" "), d.hrv, d.restingHr, d.vo2max, d.sleepH]);
  }
  return csv(rows);
}

export function healthCsv(data: AppData, from?: string, to?: string): string {
  const keys = METRICS.map((m) => m.key);
  const rows: unknown[][] = [["data", ...keys.map((k) => `${metricMeta(k).label}${metricMeta(k).unit ? ` (${metricMeta(k).unit})` : ""}`)]];
  for (const day of Object.keys(data.daily).sort()) {
    if ((from && day < from) || (to && day > to)) continue;
    rows.push([day, ...keys.map((k) => data.daily[day][k])]);
  }
  return csv(rows);
}

/** Calendario .ics importabile in Apple Calendario / Google Calendar / Outlook */
export function workoutsIcs(ws: Workout[], data: AppData): string {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").slice(0, 15);
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => "\\" + c);
  const now = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Motra Coach//IT", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Allenamenti"];
  for (const w of ws) {
    const startD = new Date(w.start);
    const end = new Date(startD.getTime() + (w.durationMin ?? 60) * 60000);
    const endIso = `${dayKey(end)}T${String(end.getHours()).padStart(2, "0")}${String(end.getMinutes()).padStart(2, "0")}00`;
    const comments = data.comments.filter((c) => c.target === w.id).map((c) => `Coach: ${c.text}`);
    const desc = [
      [w.durationMin && `${w.durationMin} min`, w.calories && `${w.calories} kcal`, w.distanceKm && `${fmtNum(w.distanceKm, 2)} km`, w.avgHr && `FC media ${w.avgHr}`].filter(Boolean).join(" · "),
      ...(w.exercises ?? []).map((e) => `${e.name}: ${e.sets.map((s) => describeSet(s)).join(" | ")}`),
      ...comments,
    ].join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${w.id}@motra-coach`,
      `DTSTAMP:${now}`,
      `DTSTART:${fmt(w.start)}`,
      `DTEND:${endIso.replace(/-/g, "")}`,
      `SUMMARY:${esc(w.name)}`,
      `DESCRIPTION:${esc(desc)}`,
      `CATEGORIES:${esc(w.type ?? "Allenamento")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  // le righe ICS vanno spezzate a 75 caratteri
  return lines.map((l) => (l.length <= 75 ? l : l.match(/.{1,74}/g)!.join("\r\n "))).join("\r\n");
}

export function backupJson(data: AppData): string {
  const { settings, ...rest } = data;
  // la chiave API non finisce mai nel file esportato
  return JSON.stringify({ ...rest, settings: { ...settings, apiKey: "" }, exportedAt: new Date().toISOString() }, null, 2);
}

const h = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Diario degli allenamenti in HTML stampabile (Stampa → Salva come PDF) */
export function reportHtml(data: AppData, ws: Workout[], title: string): string {
  const sorted = [...ws].sort((a, b) => a.start.localeCompare(b.start));
  const body = sorted
    .map((w) => {
      const d = data.daily[dayKey(w.start)] ?? {};
      const health = [d.hrv && `HRV ${fmtNum(d.hrv)} ms`, d.restingHr && `FC riposo ${fmtNum(d.restingHr)}`, d.sleepH && `Sonno ${fmtNum(d.sleepH, 1)} h`, d.vo2max && `VO₂max ${fmtNum(d.vo2max, 1)}`].filter(Boolean).join(" · ");
      const exercises = (w.exercises ?? [])
        .map((e) => `<tr><td><b>${h(e.name)}</b>${e.note ? `<br><i>${h(e.note)}</i>` : ""}</td><td>${e.sets.map((s, i) => `${i + 1}. ${h(describeSet(s))}${s.warmup ? " (risc.)" : ""}`).join("<br>")}</td></tr>`)
        .join("");
      const comments = data.comments.filter((c) => c.target === w.id).map((c) => `<div class="coach"><b>Coach AI:</b> ${h(c.text).replace(/\n/g, "<br>")}</div>`).join("");
      return `<section><h2>${h(fmtDate(w.start, true))} — ${h(w.name)}</h2>
<p class="meta">${[w.type, w.durationMin && `${w.durationMin} min`, w.calories && `${w.calories} kcal`, w.distanceKm && `${fmtNum(w.distanceKm, 2)} km`, w.avgHr && `FC media ${w.avgHr} bpm`, workoutVolume(w) && `Volume ${fmtNum(workoutVolume(w))} kg`].filter(Boolean).map(h).join(" · ")}</p>
${health ? `<p class="meta">Salute del giorno: ${h(health)}</p>` : ""}
${exercises ? `<table>${exercises}</table>` : ""}${comments}</section>`;
    })
    .join("\n");
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${h(title)}</title>
<style>body{font:14px/1.45 system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#111}h1{font-size:22px}h2{font-size:16px;margin:0 0 4px}
section{border-top:1px solid #ddd;padding:12px 0;break-inside:avoid}.meta{color:#555;margin:2px 0}table{border-collapse:collapse;width:100%;margin-top:6px}
td{border-bottom:1px solid #eee;padding:4px 6px;vertical-align:top}td:first-child{width:35%}.coach{background:#f2f6ff;border-left:3px solid #3b6ef5;padding:6px 10px;margin-top:8px}
@media print{button{display:none}}</style></head><body><button onclick="print()">Stampa / Salva PDF</button>
<h1>${h(title)}</h1><p class="meta">${sorted.length} allenamenti · generato il ${h(new Date().toLocaleString("it-IT"))}</p>${body}</body></html>`;
}
