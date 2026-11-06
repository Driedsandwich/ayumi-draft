import type { Period, Issue } from "../core/types";
import { questionPage } from "../core/rules";
import { periodName } from "./Timeline";
export function Questions({
  events,
  issues,
  deferred,
  answers,
  setAnswer,
  offset,
  setOffset,
  answer,
  defer,
  finish,
}: {
  events: Period[];
  issues: Issue[];
  deferred: string[];
  answers: Record<string, string>;
  setAnswer: (id: string, value: string) => void;
  offset: number;
  setOffset: (n: number) => void;
  answer: (q: Issue) => void;
  defer: (id: string) => void;
  finish: () => void;
}) {
  const active = issues.filter((q) => !deferred.includes(q.id));
  const current = Math.min(offset, Math.max(0, active.length - 1));
  // The rule still returns at most five questions. Present one at a time.
  const page = questionPage(active, current).slice(0, 1);
  return (
    <section className="questions-section">
      <div className="section-head">
        <div>
          <p className="eyebrow">手順 2 / 3 · 期間と聞き返しに答える</p>
          <h1>ひとつ確認</h1>
        </div>
      </div>
      <p>
        期間の内容を、ひとつだけ確認します。
        <br />
        答えにくいことは、あとに残せます。「下書きを見る」で③へ進めます。
      </p>
      <p className="status small">
        あと {active.length} 件 ・ 後で確認 {issues.length - active.length} 件
      </p>
      {page.map((q) => {
        const p = events.find((p) => p.id === q.eventId);
        const isGap = ["gap", "leading-gap", "trailing-gap"].includes(q.code);
        const choices =
          q.field === "care"
            ? [
                ["受診していない", "通院していなかった"],
                ["受診した", "通院していた"],
                ["分からない", "覚えていない"],
              ]
            : q.field === "work"
              ? [
                  ["仕事をしていた", "仕事をしていた"],
                  ["仕事を休職していた", "仕事を休職していた"],
                  ["仕事をしていなかった", "仕事をしていなかった"],
                  ["学校に通っていた", "学校に通っていた"],
                  ["分からない", "覚えていない"],
                ]
              : q.field === "daily"
                ? [
                    [
                      "家事は家族に手伝ってもらっていた",
                      "家事は家族に手伝ってもらっていた",
                    ],
                    [
                      "身の回りのことは自分でしていた",
                      "身の回りのことは自分でしていた",
                    ],
                    ["分からない", "覚えていない"],
                  ]
                : isGap
                  ? [
                      ["通院していなかった。", "通院していなかった"],
                      ["別の病院に通っていた。", "別の病院に通っていた"],
                      ["覚えていない。", "覚えていない"],
                    ]
                  : [];
        return (
          <div key={q.id}>
            <div className="question-timeline">
              {isGap && q.code === "gap" && p && events.indexOf(p) > 0 && (
                <div>
                  <strong>{periodName(events[events.indexOf(p) - 1])}</strong>
                  <p>
                    {events[events.indexOf(p) - 1].daily.value ||
                      "生活の様子は未確認"}
                  </p>
                </div>
              )}
              {isGap && (
                <div className="gap-card">
                  <strong>
                    {q.code === "leading-gap"
                      ? "発病から最初の期間まで"
                      : q.code === "trailing-gap"
                        ? "最後の期間から現在まで"
                        : "期間の間の空白"}
                  </strong>
                  <p>
                    <span className="tag unconfirmed">未確認の期間</span>
                  </p>
                  <p className="small">
                    この期間の受診・生活の様子は、まだ確認できていません。
                  </p>
                </div>
              )}
              {p && (
                <div>
                  <strong>{periodName(p)}</strong>
                  <p>{p.daily.value || p.sourceQuote}</p>
                  {(!p.care.value || p.care.value === "unknown") && (
                    <span className="tag unconfirmed">受診は未確認</span>
                  )}
                </div>
              )}
              {!p && !isGap && (
                <div>
                  <strong>経過全体について</strong>
                  <p className="small">分かることから、ひとつずつ。</p>
                </div>
              )}
            </div>
            <article className="question">
              <span className="tag">
                {q.source === "official"
                  ? "様式に沿った確認"
                  : "経過を照らし合わせて見つけた確認"}
              </span>
              <h3 id={`question-${q.id}`}>{q.message}</h3>
              {!!choices.length && (
                <fieldset
                  className="radio-group"
                  aria-labelledby={`question-${q.id}`}
                >
                  <legend className="sr-only">
                    {q.field === "care" ? "受診の有無" : "近いものを選ぶ"}
                  </legend>
                  {choices.map(([value, label]) => (
                    <label
                      className={
                        answers[q.id] === value
                          ? "radio-option selected"
                          : "radio-option"
                      }
                      key={value}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={value}
                        checked={answers[q.id] === value}
                        onChange={() => setAnswer(q.id, value)}
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {q.kind !== "review" && q.field !== "care" && (
                <label>
                  {q.kind === "add"
                    ? "この間の経過（始め・終わり・受診の有無・生活や仕事）"
                    : "あなたの回答"}
                  <textarea
                    rows={3}
                    maxLength={q.kind === "add" ? 4000 : 2000}
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    placeholder={
                      q.kind === "add"
                        ? "例：2020年4月から2021年3月まで、受診していなかった。家事は家族に頼んでいた。"
                        : "分かる範囲で書けます"
                    }
                  />
                </label>
              )}
              {q.kind === "review" && (
                <p className="small">
                  入力欄や期間ごとの「内容を直す」で修正できます。制度の扱いは医師・社会保険労務士（社労士）・年金事務所に確認してください。
                </p>
              )}
              <div className="question-actions">
                {q.kind !== "review" && (
                  <button
                    className="primary"
                    disabled={!answers[q.id]?.trim()}
                    onClick={() => answer(q)}
                  >
                    この回答を確かめる <span aria-hidden="true">›</span>
                  </button>
                )}
                <button className="text-button" onClick={() => defer(q.id)}>
                  今は分からない・後で確認
                </button>
              </div>
            </article>
          </div>
        );
      })}
      {!active.length && (
        <p className="notice">
          今答える質問はありません。下書きと、後で確認する点を見られます。
        </p>
      )}
      {active.length > 1 && (
        <nav className="question-pager" aria-label="確認する項目を選ぶ">
          <button
            disabled={current === 0}
            onClick={() => setOffset(Math.max(0, current - 1))}
          >
            前の確認
          </button>
          <span className="small">
            {current + 1} / {active.length}
          </span>
          <button
            disabled={current + 1 >= active.length}
            onClick={() => setOffset(current + 1)}
          >
            次の確認
          </button>
        </nav>
      )}
      <button className="draft-next" onClick={finish}>
        下書きを見る →
      </button>
    </section>
  );
}
