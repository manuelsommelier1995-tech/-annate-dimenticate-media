import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { EMPTY_DATA, type AppData } from "./types";
import { loadData, saveData } from "./lib/store";

interface Ctx {
  data: AppData;
  ready: boolean;
  update: (fn: (d: AppData) => AppData) => void;
  openWorkout: (id: string | null) => void;
  openWorkoutId: string | null;
}

const AppCtx = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [openWorkoutId, openWorkout] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    loadData().then((d) => { setData(d); setReady(true); });
  }, []);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    setData((prev) => {
      const next = fn(prev);
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => void saveData(next), 300);
      return next;
    });
  }, []);

  return <AppCtx.Provider value={{ data, ready, update, openWorkout, openWorkoutId }}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp fuori da AppProvider");
  return c;
}
