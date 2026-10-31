import { useEffect, useRef, useState } from "react";
import { useApp } from "../state";
import { Card, Markdown } from "../components";
import { askCoach, friendlyError, QUICK_PROMPTS } from "../lib/coach";
import type { ChatMessage } from "../types";

export function CoachView({ go }: { go: (tab: string) => void }) {
  const { data, update } = useApp();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [err, setErr] = useState("");
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [data.chat.length, live]);

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    const msgs: ChatMessage[] = [...data.chat, { role: "user", content: text.trim() }];
    update((d) => ({ ...d, chat: msgs }));
    setInput(""); setBusy(true); setErr(""); setLive("");
    abort.current = new AbortController();
    try {
      // le ultime 20 battute bastano come memoria della conversazione
      const reply = await askCoach({ data, messages: msgs.slice(-20), onText: (_, full) => setLive(full), signal: abort.current.signal });
      update((d) => ({ ...d, chat: [...msgs, { role: "assistant", content: reply }] }));
    } catch (e) {
      setErr(friendlyError(e));
      update((d) => ({ ...d, chat: msgs.slice(0, -1) }));
      setInput(text);
    } finally {
      setBusy(false); setLive("");
    }
  };

  return (
    <div className="coach-view">
      {!data.settings.apiKey && (
        <div className="notice">
          Per parlare con il coach serve una chiave API Anthropic. <button className="link" onClick={() => go("settings")}>Inseriscila in Impostazioni →</button>
        </div>
      )}
      <Card
        title="Coach AI"
        actions={data.chat.length ? <button className="btn ghost" onClick={() => update((d) => ({ ...d, chat: [] }))}>Nuova conversazione</button> : undefined}
      >
        <div className="chat">
          {!data.chat.length && (
            <div className="chat-empty">
              <p>Il coach vede i tuoi allenamenti Motra, le attività e le metriche di Apple Salute (HRV, FC a riposo, VO₂max, sonno…) e il tuo profilo. Chiedigli qualcosa o parti da qui:</p>
            </div>
          )}
          {data.chat.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === "assistant" ? <Markdown text={m.content} /> : <p>{m.content}</p>}
            </div>
          ))}
          {busy && (
            <div className="msg assistant">
              {live ? <Markdown text={live} /> : <div className="dots"><span /><span /><span /></div>}
            </div>
          )}
          <div ref={endRef} />
        </div>
        {err && <div className="error">{err}</div>}
        <div className="quick">
          {QUICK_PROMPTS.map((p) => (
            <button key={p.label} className="chip-btn" disabled={busy} onClick={() => send(p.text)}>{p.label}</button>
          ))}
        </div>
        <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <textarea
            rows={2} value={input} placeholder="Es. “Perché la mia HRV è calata questa settimana?”"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
          />
          {busy ? <button type="button" className="btn" onClick={() => abort.current?.abort()}>Stop</button> : <button className="btn primary" disabled={!input.trim()}>Invia</button>}
        </form>
      </Card>
    </div>
  );
}
