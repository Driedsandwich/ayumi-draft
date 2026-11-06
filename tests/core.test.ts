import { describe, it, expect } from "vitest";
import { parseDate, isOverFiveYears, splitSuggestion } from "../src/core/dates";
import { mockExtract, mockProvider } from "../src/core/mock";
import {
  parseExtraction,
  parsePatches,
  parseOperation,
} from "../src/core/schema";
import { analyze, applyPatches, questionPage } from "../src/core/rules";
import { runOperation } from "../src/core/pipeline";
import {
  empty,
  evidence,
  type Context,
  type Period,
  type Provider,
} from "../src/core/types";
const ctx: Context = {
  firstVisit: "",
  onset: "",
  currentHospital: "",
  illness: "",
  today: "2026-11-06",
};
const period = (start = "2020-01-01", end = "現在", id = "e1"): Period => ({
  id,
  sourceQuote: "元の文",
  start: evidence(start),
  end: evidence(end),
  care: { value: "yes", quote: "受診した" },
  hospital: evidence("A病院"),
  daily: evidence("家事が難しい"),
  work: evidence("休職"),
  treatment: evidence("月1回受診した"),
});
const codes = (events: Period[], context = ctx) =>
  analyze(events, context).issues.map((q) => q.code);
describe("日付と区切り", () => {
  it.each([
    "2021年2月30日",
    "2020-13-01",
    "2020-00-01",
    "2020-01-00",
    "高2の秋",
    "翌年5月",
    "令和元年4月1日",
  ])("補わず拒否 %s", (s) => expect(parseDate(s)).toBeNull());
  it("うるう日と和暦", () => {
    expect(parseDate("2020年2月29日")?.iso).toBe("2020-02-29");
    expect(parseDate("平成31年4月30日")?.iso).toBe("2019-04-30");
  });
  it("年月の精度を残す", () => {
    expect(parseDate("2020年5月")?.precision).toBe("month");
    expect(parseDate("2020年")?.precision).toBe("year");
  });
  it("現在だけを基準日に置く", () =>
    expect(parseDate("現在", "2026-11-06")?.iso).toBe("2026-11-06"));
  it("5年ちょうどは長期扱いしない", () =>
    expect(
      isOverFiveYears(parseDate("2020-01-01")!, parseDate("2025-01-01")!),
    ).toBe(false));
  it("5年を超えると候補を出す", () => {
    const r = splitSuggestion("2010-01-01", "2020-12-31", "2026-11-06");
    expect(r).toEqual([
      "2010-01-01 〜 2012-12-31",
      "2013-01-01 〜 2015-12-31",
      "2016-01-01 〜 2020-12-31",
    ]);
  });
  it("年月だけなら具体的な日を提案しない", () =>
    expect(splitSuggestion("2010年", "2020年", ctx.today)[0]).toContain(
      "年月日が分かってから",
    ));
});
describe("様式と整合の検査", () => {
  it("空白", () =>
    expect(
      codes([
        period("2020-01-01", "2020-03-01"),
        period("2020-04-01", "現在", "e2"),
      ]),
    ).toContain("gap"));
  it("連続なら空白なし", () =>
    expect(
      codes([
        period("2020-01-01", "2020-03-31"),
        period("2020-04-01", "現在", "e2"),
      ]),
    ).not.toContain("gap"));
  it("重なり", () =>
    expect(
      codes([
        period("2020-01-01", "2021-03-31"),
        period("2020-04-01", "現在", "e2"),
      ]),
    ).toContain("overlap"));
  it("内包する期間でも偽の空白を作らない", () => {
    const c = codes([
      period("2010-01-01", "2026-11-06"),
      period("2012-01-01", "2013-01-01", "e2"),
      period("2018-01-01", "2019-01-01", "e3"),
    ]);
    expect(c).not.toContain("gap");
    expect(c.filter((x) => x === "overlap")).toHaveLength(2);
  });
  it("月の境界が不明なら重なりを断定しない", () =>
    expect(
      codes([
        period("2020年1月", "2020年3月"),
        period("2020年3月", "現在", "e2"),
      ]),
    ).toContain("possible-overlap"));
  it("逆転", () =>
    expect(codes([period("2022-01-01", "2020-01-01")])).toContain("reverse"));
  it("未来日", () =>
    expect(codes([period("2027-01-01", "2028-01-01")])).toContain("future"));
  it("初診日より前の受診を確認する", () =>
    expect(
      codes([period("2018-01-01", "現在")], {
        ...ctx,
        firstVisit: "2020-01-01",
      }),
    ).toContain("before-first"));
  it("初診日を自動で決めない", () =>
    expect(
      analyze([period()], ctx).issues.find((q) => q.code === "first-unknown")
        ?.message,
    ).toContain("確定しません"));
  it("発病と初診の前後", () =>
    expect(
      codes([period()], {
        ...ctx,
        firstVisit: "2020-01-01",
        onset: "2021-01-01",
      }),
    ).toContain("onset-after-first"));
  it("先頭と末尾の不足", () => {
    const c = codes([period("2020-01-01", "2021-01-01")], {
      ...ctx,
      onset: "2019-01-01",
    });
    expect(c).toContain("leading-gap");
    expect(c).toContain("trailing-gap");
  });
  it("受診先がない", () =>
    expect(codes([{ ...period(), hospital: empty() }])).toContain(
      "hospital-missing",
    ));
  it("未受診なのに受診先がある", () =>
    expect(
      codes([{ ...period(), care: { value: "no", quote: "受診していない" } }]),
    ).toContain("care-conflict"));
  it("現在の医療機関を照合", () =>
    expect(codes([period()], { ...ctx, currentHospital: "B病院" })).toContain(
      "current-hospital",
    ));
  it("日付がない期間を落とさない", () =>
    expect(analyze([{ ...period(), start: empty() }], ctx).events).toHaveLength(
      1,
    ));
  it("聞き返しは5件ずつ", () => {
    const r = analyze(
      [
        {
          ...period(),
          start: empty(),
          end: empty(),
          care: empty(),
          hospital: empty(),
          daily: empty(),
          work: empty(),
          treatment: empty(),
        },
      ],
      ctx,
    );
    expect(questionPage(r.issues)).toHaveLength(5);
    expect(questionPage(r.issues, 5).length).toBeLessThanOrEqual(5);
  });
});
describe("引用とJSON", () => {
  const text =
    "2020年4月1日から現在まで、A病院に通院している。食事は家族が作る。仕事は休職している。";
  it("新しい入力を読める", () => {
    const r = parseExtraction(mockExtract(text), text);
    expect(r.events[0].hospital.value).toBe("A病院");
  });
  it("原文にない引用を拒否", () => {
    const r = mockExtract(text);
    r.events[0].daily = { value: "寝たきり", quote: "寝たきり" };
    expect(() => parseExtraction(r, text)).toThrow();
  });
  it("原文の引用があっても値を作れば拒否", () => {
    const r = mockExtract(text);
    r.events[0].daily.value = "一人で生活できない";
    expect(() => parseExtraction(r, text)).toThrow();
  });
  it("別期間の引用を流用できない", () => {
    const source = text + "\n2021年は買い物が難しい。";
    const r = mockExtract(text);
    r.events[0].daily = evidence("買い物が難しい");
    expect(() => parseExtraction(r, source)).toThrow();
  });
  it("根拠のない期間を拒否", () => {
    const r = mockExtract(text);
    r.events[0].sourceQuote = "2000年から受診した";
    expect(() => parseExtraction(r, text)).toThrow();
  });
  it("二重の同一期間を拒否", () => {
    const r = mockExtract(text);
    r.events.push(r.events[0]);
    expect(() => parseExtraction(r, text)).toThrow();
  });
  it("型が違うJSONを拒否", () =>
    expect(() =>
      parseExtraction({ events: [{ sourceQuote: text, start: "2020" }] }, text),
    ).toThrow());
  it("空白の入力を拒否", () =>
    expect(() => parseOperation({ kind: "extract", text: " " })).toThrow());
  it("長すぎる入力を拒否", () =>
    expect(() =>
      parseOperation({ kind: "extract", text: "あ".repeat(12001) }),
    ).toThrow());
  it("無関係の回答先を拒否", () =>
    expect(() =>
      parsePatches(
        {
          patches: [
            { eventId: "e2", field: "start", evidence: evidence("2021年") },
          ],
        },
        {
          kind: "answers",
          answers: [{ eventId: "e1", field: "start", text: "2021年" }],
        },
      ),
    ).toThrow());
  it("回答は対象欄だけ変更して再検査", async () => {
    const p = { ...period(), hospital: empty() };
    const result = await runOperation(
      {
        kind: "answers",
        answers: [{ eventId: "e1", field: "hospital", text: "B病院" }],
      },
      mockProvider,
    );
    const revised = applyPatches([p], result.data as never);
    expect(revised[0].hospital.value).toBe("B病院");
    expect(revised[0].daily).toEqual(p.daily);
    expect(codes(revised)).not.toContain("hospital-missing");
  });
  it("不明の回答では日付を作らない", async () => {
    const result = await runOperation(
      {
        kind: "answers",
        answers: [{ eventId: "e1", field: "start", text: "分からない" }],
      },
      mockProvider,
    );
    expect(
      (result.data as { evidence: { value: unknown } }[])[0].evidence.value,
    ).toBeNull();
  });
  it("形式エラーなら1回だけ取り直す", async () => {
    let calls = 0;
    const provider: Provider = {
      name: "openai",
      async complete() {
        calls++;
        return calls === 1 ? null : mockExtract(text);
      },
    };
    const r = await runOperation({ kind: "extract", text }, provider);
    expect(r.calls).toBe(2);
    expect(calls).toBe(2);
  });
  it("2回不正なら失敗して止まる", async () => {
    let calls = 0;
    await expect(
      runOperation(
        { kind: "extract", text },
        {
          name: "openai",
          async complete() {
            calls++;
            return {};
          },
        },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(2);
  });
  it("通信エラーの隠れた再送がない", async () => {
    let calls = 0;
    await expect(
      runOperation(
        { kind: "extract", text },
        {
          name: "openai",
          async complete() {
            calls++;
            throw Error("network");
          },
        },
      ),
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe("追加の境界・取り落とし防止", () => {
  it("発病の翌日に最初の行が始まっても発病日が抜けている", () =>
    expect(
      codes([period("2020-01-02", "現在")], { ...ctx, onset: "2020-01-01" }),
    ).toContain("leading-gap"));
  it("未受診期間に初診日が入る", () =>
    expect(
      codes([{ ...period(), care: { value: "no", quote: "受診していない" } }], {
        ...ctx,
        firstVisit: "2021-01-01",
      }),
    ).toContain("first-in-no-care"));
  it("同じ文の複数の生活状況を残す", () => {
    const text =
      "2020年から現在まで、A病院に通院している。朝起きられず、食事は家族に頼んだ。";
    const r = parseExtraction(mockExtract(text), text);
    expect(r.events[0].daily.value).toBe("朝起きられず、食事は家族に頼んだ");
  });
  it("受診と未受診を混ぜた行は区切りを確認", () => {
    const text = "2020年から受診したが、2021年から受診していない。";
    const e = mockExtract(text).events;
    expect(e[0].care.value).toBe("unknown");
    expect(codes(e)).toContain("care-change");
  });
  it("未受診の引用を受診ありへ変える出力を拒否", () => {
    const text = "2020年から現在まで、受診していない。";
    const raw = mockExtract(text);
    raw.events[0].care.value = "yes";
    expect(() => parseExtraction(raw, text)).toThrow();
  });
});

it("スラッシュの日付を原文のまま受け取り日付として照合", () => {
  const text = "2020/4/1から2021/3/31まで、受診していない。";
  const r = parseExtraction(mockExtract(text), text);
  expect(r.events[0].start.value).toBe("2020/4/1");
  expect(parseDate(r.events[0].start.value)?.iso).toBe("2020-04-01");
});
it("過大な期間数を黙って切り捨てない", () =>
  expect(() =>
    mockExtract(
      Array.from({ length: 61 }, (_, i) => `${i}番目の経過`).join("\n"),
    ),
  ).toThrow());

it("一部の日付が不明なら入力順を変えて年代を推測しない", () => {
  const events = [
    { ...period(), start: empty() },
    period("2025年", "現在", "e2"),
  ];
  expect(analyze(events, ctx).events.map((e) => e.id)).toEqual(["e1", "e2"]);
  expect(codes(events)).toContain("order-unknown");
});
it("日付がそろえば年月順に並べる", () => {
  const events = [
    period("2025-01-01", "現在", "e2"),
    period("2020-01-01", "2024-12-31", "e1"),
  ];
  expect(analyze(events, ctx).events.map((e) => e.id)).toEqual(["e1", "e2"]);
  expect(codes(events)).not.toContain("gap");
});
