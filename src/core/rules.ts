import { careSignals } from "./care";
import { parseDate, isOverFiveYears, nextDay } from "./dates";
import type { Period, Context, Issue, Analysis, Patch } from "./types";
export function applyPatches(events: Period[], patches: Patch[]): Period[] {
  return events.map((p) => {
    const next = { ...p };
    for (const patch of patches)
      if (patch.eventId === p.id) next[patch.field] = patch.evidence;
    return next;
  });
}
export function analyze(events: Period[], ctx: Context): Analysis {
  const issues: Issue[] = [];
  const add = (
    code: string,
    message: string,
    p?: Period,
    field?: Issue["field"],
    kind: Issue["kind"] = "field",
    source: Issue["source"] = "check",
  ) =>
    issues.push({
      id: [code, p?.id, field].filter(Boolean).join(":"),
      code,
      message,
      eventId: p?.id,
      field,
      kind,
      source,
    });
  const dated = events.map((p, index) => ({
    p,
    index,
    a: parseDate(p.start.value, ctx.today),
    b: parseDate(p.end.value, ctx.today),
  }));
  const sorted = dated.every((x) => x.a)
    ? [...dated].sort((a, b) => a.a!.min - b.a!.min)
    : dated;
  if (dated.some((x) => !x.a))
    add(
      "order-unknown",
      "日付が不明な期間があります。順番を推測せず入力順に残しています。年月順になっているか確かめてください。",
      undefined,
      undefined,
      "review",
    );
  const first = parseDate(ctx.firstVisit, ctx.today),
    onset = parseDate(ctx.onset, ctx.today),
    today = parseDate(ctx.today)!;
  if (!first)
    add(
      "first-unknown",
      "初診日は資料と照らして確認しましょう。アプリでは確定しません。",
      undefined,
      undefined,
      "review",
      "official",
    );
  if (ctx.firstVisit && !first)
    add(
      "first-invalid",
      "初診日の入力を確認してください。年月日が不明なら、そのまま確認事項として残せます。",
      undefined,
      undefined,
      "review",
    );
  if (first && first.precision !== "day")
    add(
      "first-partial",
      "初診日の年月は分かっていますが、日は未確認です。資料と照らしてください。",
      undefined,
      undefined,
      "review",
    );
  if (!onset)
    add(
      "onset-unknown",
      "発病からの経過がそろっているか、発病日を確認しましょう。",
      undefined,
      undefined,
      "review",
      "official",
    );
  if (first && onset && onset.min > first.max)
    add(
      "onset-after-first",
      "発病日が初診日より後です。入力や対象の病気を確かめてください。",
      undefined,
      undefined,
      "review",
    );
  if (first && first.min > today.max)
    add(
      "first-future",
      "初診日が今日より後です。入力を確かめてください。",
      undefined,
      undefined,
      "review",
    );
  for (const { p, a, b } of sorted) {
    for (const [f, d] of [
      ["start", a],
      ["end", b],
    ] as const) {
      if (!d)
        add(
          "date-missing",
          `${p.id}：${f === "start" ? "始まり" : "終わり"}はいつ頃ですか。分かる年月だけでも書けます。`,
          p,
          f,
        );
      else if (d.precision === "month" || d.precision === "year")
        add(
          "date-partial",
          `${p.id}：${f === "start" ? "始まり" : "終わり"}の日付は${p[f].value}まで分かっています。日は分かりますか。`,
          p,
          f,
        );
    }
    if (a && b && a.min > b.max)
      add(
        "reverse",
        `${p.id}：終わりが始まりより前です。終わりを確かめてください。`,
        p,
        "end",
      );
    if (a && b && isOverFiveYears(a, b))
      add(
        "long",
        `${p.id}：5年を超えています。3〜5年ごとの区切りを検討してください。簡素化の対象かは専門家に確認します。`,
        p,
        undefined,
        "review",
        "official",
      );
    if ((a && a.min > today.max) || (b && b.min > today.max))
      add(
        "future",
        `${p.id}：今日より後の日付があります。`,
        p,
        a && a.min > today.max ? "start" : "end",
      );
    const mixed = careSignals(p.sourceQuote);
    if (mixed.yes && mixed.no)
      add(
        "care-change",
        `${p.id}：受診した時期と、受診していない時期が同じ行にあります。時期ごとの経過を追記し、元の行を見直してください。`,
        p,
        undefined,
        "add",
        "official",
      );
    if (!p.care.value || p.care.value === "unknown")
      add(
        "care-missing",
        `${p.id}：この間、受診していましたか。`,
        p,
        "care",
        "field",
        "official",
      );
    if (p.care.value === "yes" && !p.hospital.value)
      add(
        "hospital-missing",
        `${p.id}：受診した医療機関の呼び名は分かりますか。仮名でもかまいません。`,
        p,
        "hospital",
        "field",
        "official",
      );
    if (p.care.value === "no" && p.hospital.value)
      add(
        "care-conflict",
        `${p.id}：受診していない期間に医療機関名があります。受診の有無を確かめてください。`,
        p,
        "care",
      );
    if (
      first &&
      a &&
      b &&
      p.care.value === "no" &&
      a.max <= first.min &&
      b.min >= first.max
    )
      add(
        "first-in-no-care",
        `${p.id}：入力した初診日が、受診していない期間の中です。日付と受診の有無を確かめてください。`,
        p,
        "care",
      );
    if (first && a && p.care.value === "yes" && a.max < first.min)
      add(
        "before-first",
        `${p.id}：入力した初診日より前に受診があります。同じ病気の受診か、初診日の記憶かを確かめてください。`,
        p,
        undefined,
        "review",
      );
    if (!p.daily.value)
      add(
        "daily-missing",
        `${p.id}：食事・外出・家事などで困ったことや、人の手助けはありましたか。`,
        p,
        "daily",
        "field",
        "official",
      );
    if (!p.work.value)
      add(
        "work-missing",
        `${p.id}：仕事や学校の様子、働いていなかった理由を教えてください。`,
        p,
        "work",
        "field",
        "official",
      );
    if (!p.treatment.value)
      add(
        "treatment-missing",
        `${p.id}：治療の経過、または受診していなかった理由は分かりますか。`,
        p,
        "treatment",
        "field",
        "official",
      );
    if (
      /から|〜|～/.test(p.sourceQuote) &&
      (/転院/.test(p.sourceQuote) ||
        (p.sourceQuote.match(/クリニック|病院|医院|診療所/g) || []).length > 1)
    )
      add(
        "hospital-change",
        `${p.id}：医療機関が変わった可能性があります。受診先ごとの期間を追記し、重複する元の期間を見直してください。`,
        p,
        undefined,
        "add",
        "official",
      );
  }
  // Compare all pairs: a nested interval must not hide an overlap or create a false gap.
  const valid = sorted
    .filter((x) => x.a && x.b && x.a.min <= x.b.max)
    .sort((a, b) => a.a!.min - b.a!.min);
  for (let i = 0; i < valid.length; i++)
    for (let j = i + 1; j < valid.length; j++) {
      const x = valid[i],
        y = valid[j];
      if (y.a!.max <= x.b!.min && x.a!.max <= y.b!.min)
        add(
          "overlap",
          `${x.p.id} と ${y.p.id} の期間が重なっています。同時受診などの事情か、日付を確認してください。`,
          y.p,
          "start",
        );
      else if (y.a!.min <= x.b!.max && x.a!.min <= y.b!.max)
        add(
          "possible-overlap",
          `${x.p.id} と ${y.p.id} は日付が不確かで、重なる可能性があります。`,
          y.p,
          "start",
        );
    }
  let covered: (typeof valid)[number] | undefined;
  for (const x of valid) {
    if (covered && x.a!.min > nextDay(covered.b!.max))
      add(
        "gap",
        `${covered.p.id} と ${x.p.id} の間は日付でつながっていません。日付不明の行でこの間を説明しているか確認し、抜けている経過を追記できます。`,
        x.p,
        undefined,
        "add",
        "official",
      );
    if (!covered || x.b!.max > covered.b!.max) covered = x;
  }
  if (onset && valid[0] && valid[0].a!.min > onset.max)
    add(
      "leading-gap",
      "発病から最初の期間までの様子を追記してください。",
      undefined,
      undefined,
      "add",
      "official",
    );
  if (covered && covered.b!.max < today.min)
    add(
      "trailing-gap",
      "最後の期間から現在までの様子を追記してください。現在まで続く場合は、期間の終わりを「現在」に直せます。",
      covered.p,
      "end",
      "add",
      "official",
    );
  if (!events.length)
    add(
      "empty",
      "分かる範囲の経過を一つ書いてください。",
      undefined,
      undefined,
      "add",
    );
  const current = valid.filter(
    (x) => x.a!.min <= today.max && x.b!.max >= today.min,
  );
  if (
    ctx.currentHospital &&
    !current.some((x) => x.p.hospital.value === ctx.currentHospital)
  )
    add(
      "current-hospital",
      "現在の医療機関と、現在を含む期間の医療機関名を照らしてください。未記載・別名・転院の可能性があります。",
      undefined,
      undefined,
      "review",
    );
  const priority: Record<string, number> = {
    reverse: 0,
    overlap: 1,
    "before-first": 2,
    gap: 3,
    "date-missing": 4,
    "care-missing": 5,
    "hospital-missing": 6,
  };
  issues.sort((a, b) => (priority[a.code] ?? 10) - (priority[b.code] ?? 10));
  return { events: sorted.map((x) => x.p), issues };
}
export const questionPage = (issues: Issue[], offset = 0) =>
  issues.slice(offset, offset + 5);
