# Motra Coach

Web app che unisce gli allenamenti di **Motra** e i dati di **Apple Salute** (HRV, VO₂max, FC a riposo, sonno, passi, peso, attività cardio…) e ti dà:

- 📅 **Calendario** degli allenamenti fatti (forza, cardio, mobilità) con l'HRV di ogni giorno
- 📈 **Grafici per ogni esercizio**: 1RM stimato, carico massimo, volume e ripetizioni per seduta, storico completo
- ❤️ **Grafici di salute**: HRV, FC a riposo, VO₂max, sonno, passi, peso… con media mobile a 7 giorni e confronto carico/recupero
- 🧠 **Coach AI** (Claude): commenta ogni allenamento, la settimana, la progressione di un esercizio e le metriche di salute, e risponde in chat
- ⬇️ **File scaricabili**: diario PDF/HTML con serie e commenti del coach, CSV (serie, allenamenti, metriche), calendario `.ics`, backup JSON
- 🔒 **Privacy**: tutto resta nel browser (IndexedDB). L'unico dato che esce è il riepilogo inviato all'API di Anthropic quando chiedi un commento al coach.

## Avvio

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # test dei parser e degli export
npm run build      # build statica in dist/
```

L'app è statica: può essere pubblicata su GitHub Pages (workflow in `.github/workflows/deploy.yml`: in *Settings → Pages* scegli “GitHub Actions” come sorgente), Netlify, Vercel o aperta da qualsiasi hosting statico. Su iPhone, aprila in Safari e usa *Condividi → Aggiungi alla schermata Home*.

## Importare i dati

### Apple Salute (HRV, VO₂max, FC, sonno, attività)
1. iPhone → app **Salute** → foto profilo → **Esporta tutti i dati sanitari**.
2. In *Importa / Esporta* carica lo ZIP (o direttamente `esportazione.xml` / `export.xml`).

Il file viene letto in streaming in un Web Worker, quindi regge esportazioni di diversi GB. Vengono estratte medie/totali giornalieri (i passi e le calorie non vengono contati due volte tra iPhone e Watch) e gli allenamenti con FC media/max, distanza e calorie.

### Motra
Formati accettati:

- **JSON** (consigliato):
  ```json
  { "workouts": [ {
      "id": "…", "source": "motra", "name": "Gambe", "start": "2026-10-30T07:09:00",
      "durationMin": 43, "calories": 177, "muscleGroups": ["glutes"],
      "exercises": [ { "id": "barbellRomanianDeadlift", "name": "Barbell Romanian Deadlift",
        "sets": [ { "reps": 8, "weight": 60, "restSec": 104, "warmup": false, "rpe": 8 } ] } ]
  } ] }
  ```
- **Testo** nel formato di dettaglio Motra (`Workout: …`, `- Esercizio (id) (3 sets):`, `set 1: 10 reps @ 60kg, 2m rest`) — si può incollare direttamente nell'app.
- **CSV** con colonne `date, workout, exercise, reps, weight, rest, rpe, warmup`.

Il modo più comodo per ottenere il JSON è chiedere a **Claude con il connettore Motra**: nell'app, *Importa / Esporta → Come ottengo i dati da Motra?* c'è il messaggio pronto da copiare.

Se lo stesso allenamento arriva sia da Motra sia da Apple Salute (Motra lo scrive in Salute), viene unito automaticamente: resta quello Motra con esercizi e serie, arricchito da FC, calorie e orario di inizio di Apple.

## Coach AI

In *Impostazioni* inserisci una chiave API Anthropic ([console.anthropic.com](https://console.anthropic.com/settings/keys)) e, se vuoi, il tuo profilo (età, obiettivi, infortuni, giorni disponibili). La chiave resta solo nel browser e non viene inclusa nei backup.

Modello predefinito: Claude Opus 5.5 con ragionamento adattivo; puoi scegliere Sonnet/Haiku (più economici) e la profondità di analisi. A ogni domanda il coach riceve un riepilogo: metriche di salute (medie 7/30/90 giorni e ultimi 14 giorni), allenamenti degli ultimi 42 giorni (dettaglio serie per le ultime 3 settimane) e progressione degli esercizi principali.

## Struttura

```
src/
  importers/appleHealth.ts        parser streaming dell'export di Apple Salute
  importers/appleHealth.worker.ts Web Worker (ZIP/XML)
  importers/motra.ts              import Motra (JSON, testo, CSV)
  lib/coach.ts                    coach AI (Anthropic SDK) e costruzione del contesto
  lib/exporters.ts                CSV, ICS, diario HTML/PDF, backup
  lib/util.ts                     statistiche (1RM, volume, medie mobili), unione dati
  views/                          Panoramica, Calendario, Esercizi, Salute, Coach, Import/Export, Impostazioni
tests/                            test Vitest
```
