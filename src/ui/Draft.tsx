import { Fragment, useState } from "react";
import {
  fields,
  labels,
  type Period,
  type Issue,
  type Field,
} from "../core/types";
import { splitSuggestion } from "../core/dates";
import type { State } from "../client/storage";
import { BackFields, activities } from "./BackFields";
import { Icon } from "./Icon";
import { sources } from "../core/sources";
import { displayDate, gapIssues } from "./Timeline";
function PeriodCard({
  p,
  today,
  edit,
  remove,
  answers,
  saveAnswer,
}: {
  p: Period;
  today: string;
  edit: (id: string, f: Field, text: string) => void;
  remove: (id: string) => void;
  answers: Record<string, string>;
  saveAnswer: (values: Record<string, string>) => void;
}) {
  const candidate = answers[`edit-field-${p.id}`];
  const field: Field = fields.includes(candidate as Field)
    ? (candidate as Field)
    : "start";
  const text = answers[`edit-text-${p.id}`] || "";
  const setText = (value: string) =>
    saveAnswer({ [`edit-text-${p.id}`]: value });
  const splits = splitSuggestion(p.start.value, p.end.value, today);
  return (
    <article className="period" id={`period-${p.id}`}>
      <div className="period-title">
        <span className="tag">期間 {p.id.slice(1)}</span>
        <h3>
          {p.start.value || "始まりは未確認"} 〜{" "}
          {p.end.value || "終わりは未確認"}
        </h3>
      </div>
      <div className="period-meta">
        <span>
          {p.care.value === "yes"
            ? "受診した"
            : p.care.value === "no"
              ? "受診していない"
              : "受診は未確認"}
        </span>
        <span>医療機関名：{p.hospital.value || "未確認・記載なし"}</span>
      </div>
      <dl>
        {(["daily", "work", "treatment"] as const).map((f) => (
          <div key={f}>
            <dt>{labels[f]}</dt>
            <dd>{p[f].value || "未記入（本人に確認）"}</dd>
          </div>
        ))}
      </dl>
      <blockquote className="personal-quote">
        本人の言葉：<q>{p.daily.quote || p.sourceQuote}</q>
      </blockquote>
      <details className="no-print">
        <summary>原文の引用を確かめる</summary>
        <p>
          <strong>この期間の原文</strong>：{p.sourceQuote}
        </p>
        {fields.map((f) => (
          <p key={f}>
            <strong>{labels[f]}</strong>：
            {p[f].quote ? `「${p[f].quote}」` : "根拠の記載なし"}
          </p>
        ))}
      </details>
      {!!splits.length && (
        <aside className="notice">
          <strong>長い期間を分ける位置の候補（まだ確定していません）</strong>
          <ul>
            {splits.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>
            元の期間を分けるための候補です。新しい出来事ではありません。各期間の様子と、簡素化できるかを確認してから正式な用紙へ写してください。
          </p>
        </aside>
      )}
      <details className="no-print">
        <summary>この期間の内容を直す</summary>
        <label>
          直す欄
          <select
            value={field}
            onChange={(e) => {
              saveAnswer({
                [`edit-field-${p.id}`]: e.target.value,
                [`edit-text-${p.id}`]: "",
              });
            }}
          >
            {fields.map((f) => (
              <option value={f} key={f}>
                {labels[f]}
              </option>
            ))}
          </select>
        </label>
        <label>
          本人の言葉で書き直す
          <textarea
            maxLength={2000}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="受診の有無は「受診した」「受診していない」。空に戻す場合は「空欄にする」。"
          />
        </label>
        <button disabled={!text.trim()} onClick={() => edit(p.id, field, text)}>
          変更内容を確かめる
        </button>
        <p className="small">
          不要な重複や、期間を分けて追記した後の元の行は削除できます。元の文は残ります。
        </p>
        <button className="danger" onClick={() => remove(p.id)}>
          この期間を削除
        </button>
      </details>
    </article>
  );
}
export function Draft({
  state,
  events,
  issues,
  change,
  edit,
  remove,
  add,
  selected,
  restart,
  writeOwn,
}: {
  state: State;
  events: Period[];
  issues: Issue[];
  change: (s: Partial<State>) => void;
  edit: (id: string, f: Field, text: string) => void;
  remove: (id: string) => void;
  add: () => void;
  selected: string;
  restart: () => void;
  writeOwn: () => void;
}) {
  const [showBack, setShowBack] = useState(false);
  return (
    <section className="draft-layout">
      <div className="draft-main">
        <div className="draft-heading">
          <div>
            <p className="eyebrow no-print">手順 3 / 3 · 下書きができました</p>
            <h1>様式の順の下書き</h1>
            <p>等級や受給の見込みは判定しません。</p>
          </div>
          <button
            className="primary print-button no-print"
            onClick={() => window.print()}
          >
            <Icon name="print" /> 印刷・PDFに保存
          </button>
        </div>
        <div className="finish-actions no-print">
          <p>
            申立書の欄の順に並びました。内容を確かめ、印刷して相談に使えます。
          </p>
          <div className="button-row">
            <button onClick={restart}>最初に戻る</button>
            <button onClick={writeOwn}>自分の入力で試す</button>
          </div>
          <p className="small">
            「最初に戻る」は今の内容を残します。「自分の入力で試す」は見本とその回答を空欄に戻します。見本を使わずに書き始めた内容は残ります。
          </p>
        </div>
        <table className="period-table">
          <caption className="sr-only">
            期間ごとの一覧（年月のみの入力は日を補っていません）
          </caption>
          <colgroup>
            <col className="col-period" />
            <col className="col-care" />
            <col className="col-hospital" />
            <col className="col-daily" />
            <col className="col-work" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">期間</th>
              <th scope="col">受診の有無</th>
              <th scope="col">医療機関</th>
              <th scope="col">日常生活の様子</th>
              <th scope="col">仕事の様子</th>
            </tr>
          </thead>
          <tbody>
            {events.map((p) => (
              <Fragment key={p.id}>
                <tr className={selected === p.id ? "selected-row" : ""}>
                  <th scope="row">
                    {displayDate(p.start.value)}
                    <br />〜 {displayDate(p.end.value)}
                  </th>
                  <td>
                    {p.care.value === "yes" ? (
                      "あり"
                    ) : p.care.value === "no" ? (
                      "なし"
                    ) : (
                      <span className="tag unconfirmed">未確認</span>
                    )}
                  </td>
                  <td>
                    {p.hospital.value ||
                      (p.care.value === "no" ? "—" : "未確認")}
                  </td>
                  <td>{p.daily.value || "未記入（本人に確認）"}</td>
                  <td>{p.work.value || "未記入（本人に確認）"}</td>
                </tr>
                <tr className="treatment-row">
                  <td colSpan={5}>
                    <span>治療経過・受診していなかった理由：</span>
                    {p.treatment.value || "未記入（本人に確認）"}
                  </td>
                </tr>
                <tr className="quote-row">
                  <td colSpan={5}>
                    本人の言葉：<q>{p.daily.quote || p.sourceQuote}</q>
                  </td>
                </tr>
                <tr className="print-source">
                  <td colSpan={5}>元の経過：{p.sourceQuote}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
        <section className="consultation">
          <h2>
            <Icon name="document" /> 医師・社会保険労務士に見せる要点
          </h2>
          <ul>
            <li>
              初診日：{state.context.firstVisit || "不明"}
              。記録・証明の資料を確認したい。
            </li>
            <li>生活への影響と、{events.length}件の期間の経過を相談したい。</li>
          </ul>
          <details>
            <summary>相談する内容を詳しく見る</summary>
            <p>
              現在の医療機関：{state.context.currentHospital || "未記入"}
              。原文と事実に違いがないか確認する。
            </p>
            <p>
              受診していない期間、期間の空白・重なり、生活上の手助け、就労・離職の経過を確認する。
            </p>
            <p>
              障害認定日、請求の種類、記載を簡素化できるか、裏面の必要な欄は専門家や年金事務所に相談する。
            </p>
          </details>
        </section>
        <div className="notice draft-disclaimer">
          <strong>
            これは下書きです。提出前に本人と専門家が確かめてください。
          </strong>
          <p>正式な申立書の代わりにはなりません。</p>
        </div>
        <details className="history-context">
          <summary>病歴の基本情報と、様式への写し方</summary>
          <dl className="summary-grid">
            <div>
              <dt>傷病名</dt>
              <dd>{state.context.illness || "未記入"}</dd>
            </div>
            <div>
              <dt>発病日</dt>
              <dd>{state.context.onset || "未確認"}</dd>
            </div>
            <div>
              <dt>初診日（本人入力・未確定）</dt>
              <dd>{state.context.firstVisit || "未確認"}</dd>
            </div>
          </dl>
          <p className="small">
            最初の欄：発病したときの状態と発病から初診までの間の状況（先天性疾患は出生時から初診まで）。以後の欄：左の期間の状況。日常生活・仕事・治療の項目は、状況欄に写しやすく分けています。
          </p>
        </details>
        <h2 className="period-detail-heading no-print">
          期間ごとの内容を確かめる
        </h2>
        <p className="small no-print">
          期間の一覧で期間を選ぶと、その期間に戻れます。
        </p>
        <div className="period-cards">
          {events.map((p) => (
            <PeriodCard
              key={p.id}
              p={p}
              today={state.context.today}
              edit={edit}
              remove={remove}
              answers={state.answers}
              saveAnswer={(values) =>
                change({ answers: { ...state.answers, ...values } })
              }
            />
          ))}
        </div>
        <details className="no-print">
          <summary>抜けている期間を追記する</summary>
          <label>
            追記する経過
            <textarea
              maxLength={4000}
              rows={4}
              value={state.extra}
              onChange={(e) => change({ extra: e.target.value })}
            />
          </label>
          <button disabled={!state.extra.trim()} onClick={add}>
            追記を確かめる
          </button>
        </details>
        <button className="no-print" onClick={() => setShowBack(!showBack)}>
          {showBack ? "裏面のメモを閉じる" : "裏面のメモも記入する"}
        </button>
        <div className="no-print">
          {showBack && <BackFields state={state} change={change} />}
        </div>
        <div className="print-only">
          <h3>就労・日常生活状況（本人メモ）</h3>
          <p>障害認定日：{state.recognitionDate || "未確認"}</p>
          {state.snapshots.map((s, i) => (
            <div key={i}>
              <h4>{i === 0 ? "1. 障害認定日頃" : "2. 現在（請求日頃）"}</h4>
              <p>
                職種：{s.job || "未記入"} ／ 通勤：{s.commute || "未記入"} ／
                出勤日数：{s.days || "未記入"}
              </p>
              <p>
                身体の調子：{s.condition || "未記入"} ／ 非就労・休職の理由：
                {s.noWork || "未記入"}
              </p>
              <p>
                {activities
                  .map((a) => `${a}：${s.daily[a] || "未記入"}`)
                  .join(" ／ ")}
              </p>
              <p>その他：{s.other || "未記入"}</p>
            </div>
          ))}
          <p>障害者手帳：{state.handbook || "未記入"}</p>
          <p>請求者・代筆者の情報と申立日は正式な用紙に記入してください。</p>
          <p>公式様式・記載要領：{sources[0].url}（確認日：2026-11-06）</p>
        </div>
        <p className="small">
          作成時の整理方法：
          {state.lastProvider === "mock"
            ? "AI を使わず、この端末で整理"
            : "AI"}{" "}
          ／ 直近に AI を使った回数：{state.lastCalls}
          回。元の文と照らし合わせても、内容の正しさや意味が合っているかは本人の確認が必要です。
        </p>
      </div>
      <aside className="review-panel">
        <h2>
          <Icon name="document" /> 確かめたい点
        </h2>
        <div className="review-content">
          <p className="small">自動チェックで残った確認：{issues.length}件</p>
          {issues.length ? (
            <ul className="issue-list">
              {issues.slice(0, 3).map((q) => (
                <li key={q.id}>
                  {q.message}
                  {state.deferred.includes(q.id) && (
                    <span className="tag unconfirmed">後で確認</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              自動検査で見つかった不足はありません。内容の正しさや提出できるかは、本人と専門家の確認が必要です。
            </p>
          )}
          {issues.length > 3 && (
            <details>
              <summary>残り {issues.length - 3} 件も見る</summary>
              <ul className="issue-list">
                {issues.slice(3).map((q) => (
                  <li key={q.id}>
                    {q.message}
                    {state.deferred.includes(q.id) && (
                      <span className="tag unconfirmed">後で確認</span>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="check-explanation">
            <strong>
              抜けた期間・重なり・初診日との食い違いを、決まった手順で確認します。
            </strong>
            <p className="small">
              AIによる文章整理（ことばの言い換え・要約）とは別の自動チェックです。
            </p>
          </div>
          <button className="no-print" onClick={() => change({ step: 1 })}>
            ひとつずつ確認する →
          </button>
          {gapIssues(issues).map((q) => (
            <div className="gap-card" key={q.id}>
              <span className="tag unconfirmed">未確認の期間</span>
              <p>{q.message}</p>
              <p className="small">
                この間の受診・生活の様子はまだ確認できていません。
              </p>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
}
