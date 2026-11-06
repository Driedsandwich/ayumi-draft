import { careSignals } from "./care";
import {
  fields,
  type Evidence,
  type Period,
  type Extraction,
  type Operation,
  type Patch,
} from "./types";
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("JSON の形が合いません。");
  return v as Record<string, unknown>;
};
export function parseEvidence(
  v: unknown,
  field: string,
  source: string,
): Evidence {
  const f = obj(v);
  if (
    !(f.value === null || typeof f.value === "string") ||
    typeof f.quote !== "string" ||
    f.quote.length > 12000
  )
    throw Error("項目の形が合いません。");
  if (f.value === null) {
    if (f.quote !== "") throw Error("空欄の引用が不正です。");
    return { value: null, quote: "" };
  }
  if (
    !f.value.trim() ||
    f.value.length > 4000 ||
    !f.quote ||
    !source.includes(f.quote)
  )
    throw Error("原文に引用が見つかりません。");
  if (field === "care") {
    if (!["yes", "no", "unknown"].includes(f.value))
      throw Error("受診の形が合いません。");
    const signals = careSignals(f.quote);
    if ((f.value === "yes" && signals.no) || (f.value === "no" && signals.yes))
      throw Error("受診の引用に矛盾があります。");
  } else if (!f.quote.includes(f.value)) throw Error("値が引用にありません。");
  return { value: f.value, quote: f.quote };
}
export function parseExtraction(v: unknown, source: string): Extraction {
  const data = obj(v);
  if (!Array.isArray(data.events) || data.events.length > 60)
    throw Error("期間の形が合いません。");
  const seen = new Set<string>();
  const events = data.events.map((item, i) => {
    const x = obj(item);
    if (
      typeof x.sourceQuote !== "string" ||
      !x.sourceQuote.trim() ||
      !source.includes(x.sourceQuote) ||
      seen.has(x.sourceQuote)
    )
      throw Error("期間の根拠がありません。");
    seen.add(x.sourceQuote);
    const p = { id: `e${i + 1}`, sourceQuote: x.sourceQuote } as Period;
    for (const key of fields)
      p[key] = parseEvidence(x[key], key, x.sourceQuote);
    return p;
  });
  if (!events.length && source.trim())
    throw Error("期間が読み取れませんでした。");
  return { events };
}
export function parsePatches(
  v: unknown,
  op: Extract<Operation, { kind: "answers" }>,
): Patch[] {
  const data = obj(v);
  if (!Array.isArray(data.patches) || data.patches.length !== op.answers.length)
    throw Error("回答の形が合いません。");
  const seen = new Set<string>();
  return data.patches.map((item) => {
    const x = obj(item);
    const a = op.answers.find(
      (a) => a.eventId === x.eventId && a.field === x.field,
    );
    if (!a || seen.has(a.eventId + ":" + a.field))
      throw Error("回答の対象が合いません。");
    seen.add(a.eventId + ":" + a.field);
    return {
      eventId: a.eventId,
      field: a.field,
      evidence: parseEvidence(x.evidence, a.field, a.text),
    };
  });
}
export function parseOutput(v: unknown, op: Operation) {
  return op.kind === "extract"
    ? parseExtraction(v, op.text)
    : parsePatches(v, op);
}
export function parseOperation(v: unknown): Operation {
  const x = obj(v);
  if (
    x.kind === "extract" &&
    typeof x.text === "string" &&
    x.text.trim() &&
    x.text.length <= 12000
  )
    return { kind: "extract", text: x.text };
  if (
    x.kind === "answers" &&
    Array.isArray(x.answers) &&
    x.answers.length > 0 &&
    x.answers.length <= 5
  ) {
    const seen = new Set<string>();
    const answers = x.answers.map((item) => {
      const a = obj(item);
      if (
        typeof a.eventId !== "string" ||
        !/^e\d+$/.test(a.eventId) ||
        !fields.includes(a.field as never) ||
        typeof a.text !== "string" ||
        !a.text.trim() ||
        a.text.length > 2000 ||
        seen.has(a.eventId + ":" + a.field)
      )
        throw Error("回答を確認してください。");
      seen.add(a.eventId + ":" + a.field);
      return {
        eventId: a.eventId,
        field: a.field as (typeof fields)[number],
        text: a.text,
      };
    });
    return { kind: "answers", answers };
  }
  throw Error("入力を確認してください。経過は12,000文字までです。");
}
