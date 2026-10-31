import { useState } from "react";
import { useApp } from "../state";
import { Card } from "../components";
import type { Settings } from "../types";

const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (consigliato)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (più economico)" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (rapidissimo, economico)" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1 (il più capace, costoso)" },
];

export function SettingsView() {
  const { data, update } = useApp();
  const [show, setShow] = useState(false);
  const s = data.settings;
  const set = (patch: Partial<Settings>) => update((d) => ({ ...d, settings: { ...d.settings, ...patch } }));
  return (
    <div className="grid">
      <Card title="Coach AI" className="span-3-half">
        <label className="field">
          <span>Chiave API Anthropic</span>
          <div className="row">
            <input type={show ? "text" : "password"} value={s.apiKey} placeholder="sk-ant-…" autoComplete="off" onChange={(e) => set({ apiKey: e.target.value.trim() })} />
            <button className="btn ghost" onClick={() => setShow(!show)}>{show ? "Nascondi" : "Mostra"}</button>
          </div>
          <small className="muted">
            Creala su <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>. Resta salvata solo in questo browser
            e viene inviata unicamente all'API di Anthropic. Non viene inclusa nei backup.
          </small>
        </label>
        <label className="field">
          <span>Modello</span>
          <select value={s.model} onChange={(e) => set({ model: e.target.value })}>
            {MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Profondità di analisi</span>
          <select value={s.effort} onChange={(e) => set({ effort: e.target.value as Settings["effort"] })}>
            <option value="low">Rapida</option>
            <option value="medium">Normale</option>
            <option value="high">Approfondita</option>
            <option value="xhigh">Molto approfondita</option>
          </select>
          <small className="muted">Più profondità = risposte più ragionate ma più lente e costose.</small>
        </label>
      </Card>
      <Card title="Profilo atleta" className="span-3-half">
        <label className="field">
          <span>Obiettivi, livello, infortuni, disponibilità settimanale</span>
          <textarea rows={9} value={s.athleteProfile} onChange={(e) => set({ athleteProfile: e.target.value })}
            placeholder={"Es.: 31 anni, 78 kg, 180 cm. Mi alleno da 4 anni.\nObiettivo: aumentare la forza su squat e stacco e correre una 10 km sotto i 45'.\n4 sedute a settimana (2 forza gambe/full body, 2 corsa), 45-60 min la mattina.\nFastidio occasionale al ginocchio destro."} />
          <small className="muted">Il coach userà queste informazioni in ogni risposta.</small>
        </label>
      </Card>
    </div>
  );
}
