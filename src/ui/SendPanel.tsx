import { useState } from "react";
import { labels, type Operation } from "../core/types";
import { CostNotice } from "./CostNotice";
export function SendPanel({
  op,
  mode,
  destination,
  busy,
  submit,
  cancel,
  step,
  returnsToDraft,
}: {
  op: Operation;
  mode: "mock" | "live";
  destination: string;
  busy: boolean;
  submit: () => void;
  cancel: () => void;
  step: number;
  returnsToDraft: boolean;
}) {
  const [agree, setAgree] = useState(false);
  return (
    <section className="send-panel" aria-labelledby="send-title">
      <p className="eyebrow">
        手順 {step + 1} / 3 ·{" "}
        {mode === "live" ? "AI に送る前の確認" : "この端末で整理する前の確認"}
      </p>
      <h2 id="send-title" tabIndex={-1}>
        整理する文を確認する
      </h2>
      {mode === "mock" ? (
        <p>
          <strong>
            AI を使わず、この端末で整理します。外部へ送信しません。
          </strong>
          簡単な文の整理を体験できます。AI を使ったときの結果とは異なります。
        </p>
      ) : (
        <>
          <p>
            <strong>経過や回答に含まれる健康情報を AI に送ります。</strong>
            送信先：{destination}。本アプリのサーバーを一時的に通ります。
          </p>
          <p>
            アプリは入力・下書きをサーバーに保存せず、ログにも書きません。AI
            の提供元やサーバーの運営元での保存条件は別です。公開された体験用のページでは架空の内容で試してください。
          </p>
          <p>
            名前・住所・電話番号は不要です。医療機関は仮名でも試せます。送信するのは下に表示した文と、整理方法の指示だけです。
          </p>
        </>
      )}
      <details open>
        <summary>
          今回{mode === "mock" ? "整理する" : "AI に送る"}文を見る
        </summary>
        <pre>
          {op.kind === "extract"
            ? op.text
            : op.answers
                .map(
                  (a) =>
                    `期間 ${a.eventId.slice(1)}・${labels[a.field]}：${a.text}`,
                )
                .join("\n")}
        </pre>
      </details>
      {mode === "live" && (
        <label className="check">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
          送信する内容と、AI 提供元に送ることを確認しました
        </label>
      )}
      <CostNotice />
      <div className="button-row">
        <button
          className="primary"
          disabled={busy || (mode === "live" && !agree)}
          onClick={submit}
        >
          {busy
            ? "整理しています…（最長約50秒）"
            : mode === "live"
              ? "AI で読む（数秒かかります）"
              : "この内容で整理する（AI は使いません）"}
        </button>
        <button onClick={cancel}>
          {busy ? "処理を中止する" : "戻って直す"}
        </button>
      </div>
      <p className="small">
        {returnsToDraft
          ? "整理が終わると、③の下書きに期間を追加します。"
          : "整理が終わると、②で期間と聞き返しを確かめられます。"}
      </p>
      {mode === "live" && (
        <p className="small">
          混雑時は約50秒かかることがあります。読み取った内容を確認するため、必要なときだけ1回やり直します（AI
          は最大2回）。
        </p>
      )}
    </section>
  );
}
