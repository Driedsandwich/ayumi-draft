import { fields, type Context, type Period } from "../core/types";
import { parseEvidence } from "../core/schema";
export const storageKey = "ayumi-draft-v1";
export type Snapshot = {
  job: string;
  commute: string;
  days: string;
  condition: string;
  noWork: string;
  daily: Record<string, string>;
  other: string;
};
export const blankSnapshot = (): Snapshot => ({
  job: "",
  commute: "",
  days: "",
  condition: "",
  noWork: "",
  daily: {},
  other: "",
});
export type State = {
  version: 1;
  text: string;
  context: Context;
  events: Period[];
  sources: string[];
  extractionSourceCount: number;
  deferred: string[];
  answers: Record<string, string>;
  step: number;
  mode: "mock" | "live";
  lastProvider: string;
  lastCalls: number;
  snapshots: [Snapshot, Snapshot];
  recognitionDate: string;
  handbook: string;
  extra: string;
};
export const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const fresh = (): State => ({
  version: 1,
  text: "",
  context: {
    firstVisit: "",
    onset: "",
    currentHospital: "",
    illness: "",
    today: localToday(),
  },
  events: [],
  sources: [],
  extractionSourceCount: 0,
  deferred: [],
  answers: {},
  step: 0,
  mode: "mock",
  lastProvider: "",
  lastCalls: 0,
  snapshots: [blankSnapshot(), blankSnapshot()],
  recognitionDate: "",
  handbook: "",
  extra: "",
});
export function sourceState(originals: string[], events: Period[]) {
  const original = originals.join("\n");
  const quotes = new Set<string>();
  for (const period of events)
    for (const field of fields) {
      const quote = period[field].quote;
      if (quote && !original.includes(quote)) quotes.add(quote);
    }
  return {
    sources: [...originals, ...quotes],
    extractionSourceCount: originals.length,
  };
}
export function restore(): { state: State; error: string } {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { state: fresh(), error: "" };
    if (raw.length > 600000) throw Error();
    const s = JSON.parse(raw) as State;
    if (
      s.version !== 1 ||
      typeof s.text !== "string" ||
      s.text.length > 12000 ||
      ![0, 1, 2].includes(s.step) ||
      !["mock", "live"].includes(s.mode) ||
      !Array.isArray(s.sources) ||
      !s.sources.every((x) => typeof x === "string") ||
      (s.extractionSourceCount !== undefined &&
        (!Number.isSafeInteger(s.extractionSourceCount) ||
          s.extractionSourceCount < 0 ||
          s.extractionSourceCount > s.sources.length)) ||
      !Array.isArray(s.events) ||
      s.events.length > 60 ||
      !s.context ||
      !["firstVisit", "onset", "currentHospital", "illness", "today"].every(
        (k) =>
          typeof (s.context as unknown as Record<string, unknown>)[k] ===
          "string",
      ) ||
      !Array.isArray(s.deferred) ||
      !s.deferred.every((x) => typeof x === "string") ||
      !s.answers ||
      !Object.values(s.answers).every((x) => typeof x === "string") ||
      !Array.isArray(s.snapshots) ||
      s.snapshots.length !== 2
    )
      throw Error();
    const all = s.sources.join("\n");
    const ids = new Set<string>();
    for (const e of s.events) {
      if (
        !/^e\d+$/.test(e.id) ||
        ids.has(e.id) ||
        typeof e.sourceQuote !== "string" ||
        !all.includes(e.sourceQuote)
      )
        throw Error();
      ids.add(e.id);
      for (const f of fields) e[f] = parseEvidence(e[f], f, all);
    }
    for (const snap of s.snapshots) {
      if (
        !snap ||
        !["job", "commute", "days", "condition", "noWork", "other"].every(
          (k) =>
            typeof (snap as unknown as Record<string, unknown>)[k] === "string",
        ) ||
        !snap.daily ||
        !Object.values(snap.daily).every((x) => typeof x === "string")
      )
        throw Error();
    }
    // 以前の保存形式から、最初の経過と現在の下書きを支える原文を引き継ぐ。
    const originals =
      s.extractionSourceCount === undefined
        ? [
            ...new Set([
              ...s.sources.slice(0, 1),
              ...s.events
                .map((e) => e.sourceQuote)
                .filter((quote) => !s.sources[0]?.includes(quote)),
            ]),
          ]
        : s.sources.slice(0, s.extractionSourceCount);
    return {
      state: {
        ...fresh(),
        ...s,
        ...sourceState(originals, s.events),
        context: { ...s.context, today: localToday() },
      },
      error: "",
    };
  } catch {
    return {
      state: fresh(),
      error: "端末にある保存内容を読み込めませんでした。新しく入力できます。",
    };
  }
}
