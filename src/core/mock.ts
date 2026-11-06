import { careSignals } from "./care";
import {
  empty,
  evidence,
  type Operation,
  type Period,
  type Field,
} from "./types";
export const datePattern =
  /(?:昭和|平成|令和)(?:元|\d{1,2})年(?:\d{1,2}月)?(?:\d{1,2}日)?|\d{4}年(?:\d{1,2}月)?(?:\d{1,2}日)?|\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?|現在|今日/g;
function care(s: string) {
  const { yes, no } = careSignals(s);
  return {
    value: yes && no ? "unknown" : no ? "no" : yes ? "yes" : "unknown",
    quote: s,
  };
}
export function mockField(text: string, field: Field) {
  const s = text.trim();
  if (/^(分からない|わからない|不明|覚えていない|空欄にする)$/.test(s))
    return empty();
  if (field === "care") return care(s);
  if (field === "start" || field === "end") {
    const ds = s.match(datePattern) || [];
    return ds[0] ? evidence(ds[0]) : empty();
  }
  return evidence(s);
}
export function mockExtract(text: string) {
  // No case IDs, expected answers or sample tables: deterministic extraction over unseen text.
  const paragraphs = text
    .split(/\n+/)
    .map((s) => s.trim().replace(/^[・●\-]\s*/, ""))
    .filter(Boolean);
  const segments = paragraphs.flatMap((p) =>
    p
      .split(
        /(?<=[。])(?=\s*(?:(?:昭和|平成|令和)|\d{4}[年/\-]|高[123１２３]))/,
      )
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const unique = [...new Set(segments)];
  if (unique.length > 60)
    throw Error("期間が多すぎます。60件以内に分けて整理してください。");
  return {
    events: unique.map((s, i) => {
      const dates = [...s.matchAll(datePattern)];
      const first = dates[0];
      const second = dates[1];
      const start =
        first && first[0] !== "現在" && first[0] !== "今日"
          ? evidence(first[0])
          : empty();
      const between =
        first && second
          ? s.slice(
              (first.index ?? 0) + first[0].length,
              (second.index ?? 0) + second[0].length,
            )
          : "";
      const end =
        second && /(?:から|〜|～|~)/.test(between)
          ? evidence(second[0])
          : first && /^(現在|今日)$/.test(first[0])
            ? evidence(first[0])
            : empty();
      const clauses = [...s.matchAll(/[^。；;、]+/g)];
      const find = (re: RegExp) => {
        const matches = clauses.filter((c) => re.test(c[0]));
        const first = matches[0],
          last = matches.at(-1);
        return first && last
          ? evidence(s.slice(first.index!, last.index! + last[0].length).trim())
          : empty();
      };
      const h = s.match(
        /([A-Za-zＡ-Ｚａ-ｚ一-龠ぁ-んァ-ヶ〇ー]+(?:クリニック|病院|医院|診療所))/,
      );
      const period: Period = {
        id: `e${i + 1}`,
        sourceQuote: s,
        start,
        end,
        care: care(s),
        hospital: h ? evidence(h[1]) : empty(),
        daily: find(
          /起き|眠|食事|家事|入浴|外出|買い物|生活|着替|学校|掃除|歩|痛|疲|不安|家族|介助|朝/,
        ),
        work: find(
          /就職|退職|離職|仕事|就労|勤務|欠勤|休職|働|出勤|無職|職場|学校/,
        ),
        treatment: find(
          /受診|通院|入院|治療|服薬|薬|医師|転院|予約|受診中止|通院中断/,
        ),
      };
      return period;
    }),
  };
}
export const mockProvider = {
  name: "mock",
  async complete(op: Operation) {
    return op.kind === "extract"
      ? mockExtract(op.text)
      : {
          patches: op.answers.map((a) => ({
            eventId: a.eventId,
            field: a.field,
            evidence: mockField(a.text, a.field),
          })),
        };
  },
};
