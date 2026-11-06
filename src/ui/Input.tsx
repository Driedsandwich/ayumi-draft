import { labels, type Field } from "../core/types";
import { periodName } from "./Timeline";
import { samples } from "../config/samples";
import type { State } from "../client/storage";
import { CostNotice } from "./CostNotice";
export function Input({
  state,
  change,
  sample,
  prepare,
  selected,
  edit,
  aiAvailable,
}: {
  state: State;
  change: (s: Partial<State>) => void;
  sample: (i: number) => void;
  prepare: () => void;
  selected: string;
  edit: (id: string, field: Field, text: string) => void;
  aiAvailable: boolean;
}) {
  const selectedPeriod = state.events.find((p) => p.id === selected);
  const fieldKey = `edit-field-${selected}`;
  const textKey = `edit-text-${selected}`;
  const selectedField = ["daily", "work", "treatment"].includes(
    state.answers[fieldKey],
  )
    ? (state.answers[fieldKey] as Field)
    : "daily";
  const updateAnswer = (key: string, value: string) =>
    change({
      answers: {
        ...state.answers,
        [fieldKey]: selectedField,
        ...(key === fieldKey ? { [textKey]: "" } : {}),
        [key]: value,
      },
    });
  if (selectedPeriod)
    return (
      <section aria-labelledby="input-title">
        <p className="eyebrow">手順 1 / 3 · 選んだ期間を書く</p>
        <p className="selected-period">
          選択中の期間：{periodName(selectedPeriod)}
        </p>
        <div className="section-head">
          <h1 id="input-title" tabIndex={-1}>
            経過を書く
          </h1>
        </div>
        <p className="writing-reassurance">話すように書いて大丈夫です</p>
        <p>短い文でも、途中まででも大丈夫です。</p>
        <label>
          補足・書き直しをする欄
          <select
            value={selectedField}
            onChange={(e) => updateAnswer(fieldKey, e.target.value)}
          >
            {(["daily", "work", "treatment"] as const).map((f) => (
              <option key={f} value={f}>
                {labels[f]}
              </option>
            ))}
          </select>
        </label>
        <p className="small">
          今の下書き：{selectedPeriod[selectedField].value || "未記入"}
        </p>
        <label htmlFor="period-writing">この期間の経過</label>
        <textarea
          className="period-writing"
          id="period-writing"
          maxLength={2000}
          value={state.answers[textKey] || ""}
          onChange={(e) => updateAnswer(textKey, e.target.value)}
          placeholder="例：朝起きられず、学校を休む日が増えました。食事は家族に用意してもらっていました。"
        />
        <p className="small">
          選んだ欄を、この文をもとに書き直します。残したい内容も一緒に書けます。
        </p>
        <div className="send-explanation">
          <span aria-hidden="true">ⓘ</span>
          <p>
            {state.mode === "mock"
              ? "次に、この端末で整理する文を確認します。AI は使いません。"
              : "次に、AI に送る文を確認します。まだ送信はしません。名前や住所は書かなくて大丈夫です。"}
          </p>
        </div>
        <button
          className="primary organize-button"
          disabled={!state.answers[textKey]?.trim()}
          onClick={() => edit(selected, selectedField, state.answers[textKey])}
        >
          内容を確認して進む <span aria-hidden="true">›</span>
        </button>
        {state.mode === "live" && <CostNotice />}
      </section>
    );
  return (
    <section aria-labelledby="input-title">
      <div className="section-head">
        <span className="number">01</span>
        <div>
          <p className="eyebrow">手順 1 / 3 · 思い出せるところから</p>
          <h1 id="input-title" tabIndex={-1}>
            経過を書く
          </h1>
        </div>
      </div>
      <p className="writing-reassurance">話すように書いて大丈夫です</p>
      <p>短い文でも、途中まででも大丈夫です。</p>
      {samples.some((s) => s.text === state.text) && (
        <p className="sample-ready">
          見本が入りました。そのまま「内容を確認して進む」を押せます。分からない質問は後に残して、下書きまで進めます。
        </p>
      )}
      <label htmlFor="history">
        経過の文 <span className="small">（12,000文字まで）</span>
      </label>
      <textarea
        id="history"
        rows={11}
        maxLength={12000}
        value={state.text}
        onChange={(e) => change({ text: e.target.value })}
        placeholder="例：2021年4月から2022年3月まで、受診していなかった。朝起きられず、家族に食事を用意してもらっていた。仕事は休んでいた。"
      />
      <p className="small counter">
        {state.text.length.toLocaleString()} / 12,000文字
      </p>
      <details>
        <summary>分かっている情報を添える（空欄でも進めます）</summary>
        <div className="form-grid">
          {(
            [
              ["illness", "病気やけがの名前（診断書にある名前）"],
              ["onset", "症状が出始めた日（発病日）"],
              ["firstVisit", "初めて受診した日（初診日）"],
              ["currentHospital", "現在の医療機関"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                value={state.context[key]}
                maxLength={200}
                placeholder={
                  key === "onset" || key === "firstVisit"
                    ? "例：2020-05-10、2020年5月"
                    : ""
                }
                onChange={(e) =>
                  change({
                    context: { ...state.context, [key]: e.target.value },
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="small">
          この情報は、この端末で経過と照らし合わせるために使います。初診日を自動で決めることはしません。
        </p>
      </details>
      <div className="send-explanation">
        <span aria-hidden="true">ⓘ</span>
        <p>
          {state.mode === "mock"
            ? "今は AI を使わず、この端末で整理します。次に文を確認して、②の聞き返しに進みます。"
            : "次に、AI に送る文を確認します。まだ送信はしません。名前や住所は書かなくて大丈夫です。"}
        </p>
      </div>
      {state.mode === "mock" &&
        aiAvailable &&
        !samples.some((s) => s.text === state.text) && (
          <button onClick={() => change({ mode: "live" })}>
            自分の経過を AI で整理する方法に切り替える
          </button>
        )}
      {state.mode === "mock" && !aiAvailable && (
        <p className="small">
          今は AI
          を利用できません。見本や入力した文を、この端末で整理して試せます。
        </p>
      )}
      <button
        className="primary organize-button"
        disabled={!state.text.trim()}
        onClick={prepare}
      >
        内容を確認して進む <span aria-hidden="true">›</span>
      </button>
      {state.mode === "live" && <CostNotice />}
      <div className="samples" id="samples">
        <strong>見本を選ぶ（3つとも AI は使いません）</strong>
        <p className="small">
          すべて架空の人・医療機関です。選ぶと入力欄を置き換えます。
        </p>
        <div className="button-row">
          {samples.map((s, i) => (
            <button
              key={s.title}
              className="secondary"
              onClick={() => sample(i)}
            >
              {i + 1}. {s.title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
