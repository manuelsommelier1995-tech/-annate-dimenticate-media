import { useEffect, useState } from "react";
import { useApp } from "./state";
import { WorkoutModal } from "./components";
import { Dashboard } from "./views/Dashboard";
import { CalendarView } from "./views/Calendar";
import { ExercisesView } from "./views/Exercises";
import { HealthView } from "./views/Health";
import { CoachView } from "./views/Coach";
import { ImportExportView } from "./views/ImportExport";
import { SettingsView } from "./views/Settings";

const TABS = [
  { id: "dashboard", label: "Panoramica", icon: "◉" },
  { id: "calendar", label: "Calendario", icon: "▦" },
  { id: "exercises", label: "Esercizi", icon: "↗" },
  { id: "health", label: "Salute", icon: "♡" },
  { id: "coach", label: "Coach AI", icon: "✦" },
  { id: "import", label: "Importa / Esporta", icon: "⇅" },
  { id: "settings", label: "Impostazioni", icon: "⚙" },
];

export function App() {
  const { ready } = useApp();
  const [tab, setTab] = useState(() => location.hash.slice(1) || "dashboard");
  useEffect(() => {
    const on = () => setTab(location.hash.slice(1) || "dashboard");
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  const go = (t: string) => { location.hash = t; setTab(t); };

  return (
    <div className="app">
      <nav className="nav">
        <div className="brand">Motra<span>Coach</span></div>
        {TABS.map((t) => (
          <button key={t.id} className={`nav-item ${tab === t.id ? "on" : ""}`} onClick={() => go(t.id)}>
            <span className="nav-icon">{t.icon}</span>
            <span className="nav-label">{t.label}</span>
          </button>
        ))}
      </nav>
      <main className="main">
        <h1 className="page-title">{TABS.find((t) => t.id === tab)?.label}</h1>
        {!ready ? <p className="muted">Caricamento…</p> : (
          <>
            {tab === "dashboard" && <Dashboard go={go} />}
            {tab === "calendar" && <CalendarView />}
            {tab === "exercises" && <ExercisesView />}
            {tab === "health" && <HealthView />}
            {tab === "coach" && <CoachView go={go} />}
            {tab === "import" && <ImportExportView />}
            {tab === "settings" && <SettingsView />}
          </>
        )}
      </main>
      <WorkoutModal />
    </div>
  );
}
