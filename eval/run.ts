import { writeFile } from "node:fs/promises";
import cases from "./cases.json";
import { createProvider } from "../server/providers";
import { runOperation } from "../src/core/pipeline";
import { analyze } from "../src/core/rules";
import { fields, type Extraction } from "../src/core/types";
const real = process.argv.includes("--real");
if (
  real &&
  (!process.env.AI_API_KEY ||
    !process.env.AI_MODEL ||
    !process.env.AI_BASE_URL ||
    process.env.AI_PROVIDER !== "openai")
) {
  console.error(
    "本物の評価は未確認です。AI_PROVIDER=openai と接続先・モデル・鍵の環境変数を設定してください。",
  );
  process.exit(2);
}
const rows = [];
let matched = 0,
  total = 0,
  periodMatched = 0,
  periodTotal = 0,
  inventedPeriods = 0,
  inventedFacts = 0,
  missingPeriods = 0,
  checks = 0,
  expectedChecks = 0,
  failures = 0;
for (const c of cases) {
  try {
    const result = await runOperation(
      { kind: "extract", text: c.text },
      createProvider(real ? process.env : { AI_PROVIDER: "mock" }),
    );
    const events = (result.data as Extraction).events;
    let cells = 0;
    for (let i = 0; i < Math.max(c.expected.length, events.length); i++) {
      const exp = c.expected[i],
        actual = events[i];
      total += fields.length;
      for (const field of fields) {
        if (exp && actual && actual[field].value === exp[field]) {
          matched++;
          cells++;
        }
        if (
          actual &&
          actual[field].value !== null &&
          field !== "care" &&
          (!actual[field].quote.includes(actual[field].value!) ||
            !c.text.includes(actual[field].quote))
        )
          inventedFacts++;
      }
      if (
        actual &&
        exp &&
        actual.start.value === exp.start &&
        actual.end.value === exp.end
      )
        periodMatched++;
      // Hand-authored row count and anchors: unsupported extra dates or event rows count as inventions.
      if (actual && (!c.text.includes(actual.sourceQuote) || !exp))
        inventedPeriods++;
      if (actual && exp)
        for (const f of ["start", "end"] as const)
          if (actual[f].value !== null && actual[f].value !== exp[f])
            inventedFacts++;
    }
    periodTotal += Math.max(events.length, c.expected.length);
    missingPeriods += Math.max(0, c.expected.length - events.length);
    const codes = analyze(events, c.context).issues.map((q) => q.code);
    let found = 0;
    for (const code of c.expectedIssues) {
      expectedChecks++;
      if (codes.includes(code)) {
        checks++;
        found++;
      }
    }
    rows.push({
      id: c.id,
      title: c.title,
      expectedPeriods: c.expected.length,
      actualPeriods: events.length,
      matchingCells: cells,
      totalCells: Math.max(c.expected.length, events.length) * fields.length,
      expectedChecks: c.expectedIssues.length,
      foundChecks: found,
      calls: result.calls,
    });
  } catch {
    failures++;
    rows.push({
      id: c.id,
      title: c.title,
      error: "出力検査または接続失敗。原文・出力は記録しません。",
    });
  }
}
const report = {
  mode: real ? "real" : "mock",
  date: new Date().toISOString(),
  cases: cases.length,
  passedCases: cases.length - failures,
  periods: {
    matched: periodMatched,
    total: periodTotal,
    ratio: periodTotal ? periodMatched / periodTotal : 0,
    missing: missingPeriods,
  },
  fields: { matched, total, ratio: total ? matched / total : 0 },
  inventedPeriods,
  inventedFacts,
  ruleChecks: { matched: checks, total: expectedChecks },
  failures,
  thresholds: {
    periodRatio: 1,
    fieldRatio: 1,
    inventedPeriods: 0,
    inventedFacts: 0,
  },
  limitation:
    "合成例の一致率。引用の実在と抽出値の一致を検査するが、臨床的真偽や引用の意味・期間との対応を保証しない。実利用の性能ではない。",
  rows,
};
await writeFile(
  `eval/results.${real ? "real" : "mock"}.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report, null, 2));
if (
  failures ||
  missingPeriods ||
  inventedPeriods ||
  inventedFacts ||
  matched !== total ||
  periodMatched !== periodTotal ||
  checks !== expectedChecks
)
  process.exitCode = 1;
