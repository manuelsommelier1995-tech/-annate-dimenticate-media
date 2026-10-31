/// <reference lib="webworker" />
// Web Worker: legge il file (ZIP o XML) in streaming e lo passa al parser.
import { Unzip, UnzipInflate } from "fflate";
import { AppleHealthParser } from "./appleHealth";

export type WorkerIn = { file: File };
export type WorkerOut =
  | { type: "progress"; read: number; total: number; records: number }
  | { type: "done"; result: ReturnType<AppleHealthParser["finish"]> }
  | { type: "error"; message: string };

const post = (m: WorkerOut) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);
const XML_NAME = /(^|\/)(export|esportazione|exportar|exporter)\.xml$/i;

self.onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const { file } = ev.data;
  const parser = new AppleHealthParser();
  const decoder = new TextDecoder("utf-8");
  let read = 0;
  let lastPost = 0;
  const progress = () => {
    const now = Date.now();
    if (now - lastPost > 250) {
      lastPost = now;
      post({ type: "progress", read, total: file.size, records: parser.records });
    }
  };
  try {
    const isZip = /\.zip$/i.test(file.name) || file.type.includes("zip");
    const reader = file.stream().getReader();
    if (!isZip) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        read += value.length;
        parser.push(decoder.decode(value, { stream: true }));
        progress();
      }
      parser.push(decoder.decode());
    } else {
      let found = false;
      let finished = false;
      const unzip = new Unzip((entry) => {
        if (found || !XML_NAME.test(entry.name) || /cda/i.test(entry.name)) return;
        found = true;
        entry.ondata = (err, chunk, final) => {
          if (err) throw err;
          parser.push(decoder.decode(chunk, { stream: !final }));
          if (final) finished = true;
        };
        entry.start();
      });
      unzip.register(UnzipInflate);
      for (;;) {
        const { done, value } = await reader.read();
        if (done) { unzip.push(new Uint8Array(0), true); break; }
        read += value.length;
        unzip.push(value);
        progress();
        if (finished) break;
      }
      if (!found) throw new Error("Nello ZIP non ho trovato export.xml / esportazione.xml");
    }
    post({ type: "done", result: parser.finish() });
  } catch (e) {
    post({ type: "error", message: e instanceof Error ? e.message : String(e) });
  }
};
