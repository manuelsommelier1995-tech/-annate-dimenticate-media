// Persistenza locale (IndexedDB): i dati restano solo nel browser dell'utente.
import { get, set, del } from "idb-keyval";
import { EMPTY_DATA, DEFAULT_SETTINGS, type AppData } from "../types";

const KEY = "motra-coach-data-v1";

export async function loadData(): Promise<AppData> {
  const d = (await get<AppData>(KEY)) ?? EMPTY_DATA;
  return { ...EMPTY_DATA, ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
}

export async function saveData(d: AppData) {
  await set(KEY, d);
}

export async function clearData() {
  await del(KEY);
}
