export const fields = [
  "start",
  "end",
  "care",
  "hospital",
  "daily",
  "work",
  "treatment",
] as const;
export type Field = (typeof fields)[number];
export type Evidence = { value: string | null; quote: string };
export type Period = {
  id: string;
  sourceQuote: string;
  start: Evidence;
  end: Evidence;
  care: Evidence;
  hospital: Evidence;
  daily: Evidence;
  work: Evidence;
  treatment: Evidence;
};
export type Extraction = { events: Period[] };
export type Answer = { eventId: string; field: Field; text: string };
export type Patch = { eventId: string; field: Field; evidence: Evidence };
export type Operation =
  { kind: "extract"; text: string } | { kind: "answers"; answers: Answer[] };
export type Provider = {
  name: string;
  complete: (op: Operation, repair: boolean) => Promise<unknown>;
};
export type Context = {
  firstVisit: string;
  onset: string;
  currentHospital: string;
  illness: string;
  today: string;
};
export type Issue = {
  id: string;
  code: string;
  message: string;
  eventId?: string;
  field?: Field;
  kind: "field" | "add" | "review";
  source: "official" | "check";
};
export type Analysis = { events: Period[]; issues: Issue[] };
export const labels: Record<Field, string> = {
  start: "期間の始め",
  end: "期間の終わり",
  care: "受診の有無",
  hospital: "医療機関名",
  daily: "日常生活状況",
  work: "就労状況",
  treatment: "治療経過・受診していなかった理由など",
};
export const empty = (): Evidence => ({ value: null, quote: "" });
export const evidence = (s: string): Evidence => ({ value: s, quote: s });
