import { useEffect, useRef, useState } from "react";
import { restore, fresh, storageKey, type State } from "./client/storage";
import { samples } from "./config/samples";
import { analyze, applyPatches } from "./core/rules";
import { parseOutput } from "./core/schema";
import { mockProvider } from "./core/mock";
import { runOperation } from "./core/pipeline";
import type { Operation, Extraction, Patch, Issue, Field } from "./core/types";
import { Input } from "./ui/Input";
import { Sources } from "./ui/Sources";
import { SendPanel } from "./ui/SendPanel";
import { Questions } from "./ui/Questions";
import { Draft } from "./ui/Draft";
import { Icon } from "./ui/Icon";
import { Timeline } from "./ui/Timeline";
import { CostNotice } from "./ui/CostNotice";
const steps = [
  "経過を書く（見本あり）",
  "期間と聞き返しに答える",
  "様式の順の下書きを見る",
];
const navigationKey = "ayumi-draft-navigation-v1";
function restoreNavigation(): { selected: string; offset: number } {
  try {
    const value = JSON.parse(localStorage.getItem(navigationKey) || "null");
    if (
      value &&
      typeof value.selected === "string" &&
      Number.isSafeInteger(value.offset) &&
      value.offset >= 0
    )
      return value;
  } catch {}
  return { selected: "", offset: 0 };
}
type Pending = { op: Operation; purpose: "replace" | "append" | "patch" };
export default function App() {
  const [navigation] = useState(restoreNavigation);
  const [loaded] = useState(restore),
    [state, setState] = useState(loaded.state),
    [storageError, setStorageError] = useState(loaded.error),
    [error, setError] = useState(""),
    [pending, setPending] = useState<Pending | null>(null),
    [busy, setBusy] = useState(false),
    [offset, setOffset] = useState(navigation.offset),
    [config, setConfig] = useState({ provider: "mock", destination: "未設定" }),
    [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState(navigation.selected);
  const [resting, setResting] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const workflow = useRef<HTMLElement>(null);
  const previousStep = useRef(state.step);
  const preferInputFocus = useRef(false);
  const focusWorkflow = () => {
    requestAnimationFrame(() => {
      workflow.current?.focus({ preventScroll: true });
      workflow.current?.scrollIntoView({ block: "start" });
    });
  };
  useEffect(() => {
    if (previousStep.current !== state.step) {
      if (!preferInputFocus.current) focusWorkflow();
      preferInputFocus.current = false;
    }
    previousStep.current = state.step;
  }, [state.step]);
  const abort = useRef<AbortController | null>(null),
    generation = useRef(0),
    panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const change = (s: Partial<State>) => setState((prev) => ({ ...prev, ...s }));
  useEffect(() => {
    fetch("/api/analyze", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((v) => {
        if (
          typeof v.provider === "string" &&
          typeof v.destination === "string"
        ) {
          setConfig(v);
          // 接続状況だけを更新する。整理方法は本人の選択を保つ。
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    try {
      const content = JSON.stringify(state);
      if (content.length > 600000) throw Error("storage limit");
      localStorage.setItem(storageKey, content);
      localStorage.setItem(navigationKey, JSON.stringify({ selected, offset }));
      setSaved(true);
    } catch {
      setSaved(false);
      setStorageError(
        "端末に保存できません。画面を閉じる前に下書きを印刷してください。",
      );
    }
  }, [state, selected, offset]);
  useEffect(() => {
    if (pending) {
      document.getElementById("send-title")?.focus({ preventScroll: true });
      panel.current?.scrollIntoView({ block: "start" });
    }
  }, [pending]);
  const cancel = () => {
    generation.current++;
    abort.current?.abort();
    setBusy(false);
    setPending(null);
    requestAnimationFrame(() => {
      if (returnFocus.current?.isConnected) returnFocus.current.focus();
    });
  };
  const prepare = (op: Operation, purpose: Pending["purpose"]) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setError("");
    setPending({ op, purpose });
  };
  const send = async () => {
    if (!pending || busy) return;
    const task = pending;
    const version = ++generation.current;
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      let result: {
        data: Extraction | Patch[];
        calls: number;
        provider: string;
      };
      if (state.mode === "mock")
        result = await runOperation(task.op, mockProvider);
      else {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task.op),
          signal: AbortSignal.any([
            abort.current.signal,
            AbortSignal.timeout(52000),
          ]),
        });
        const payload = await res.json();
        if (!res.ok)
          throw Error(
            typeof payload.error === "string"
              ? payload.error
              : "接続できませんでした。",
          );
        result = {
          ...payload,
          data: parseOutput(
            task.op.kind === "answers"
              ? { patches: payload.data }
              : payload.data,
            task.op,
          ),
        };
      }
      if (version !== generation.current) return;
      if (
        task.purpose === "append" &&
        state.events.length + (result.data as Extraction).events.length > 60
      )
        throw Error("期間は60件までです。重複を整理してください。");
      setState((prev) => {
        const sources =
          task.op.kind === "extract"
            ? [task.op.text]
            : task.op.answers.map((a) => a.text);
        let events = prev.events;
        if (task.purpose === "patch")
          events = applyPatches(events, result.data as Patch[]);
        else {
          const incoming = (result.data as Extraction).events;
          if (task.purpose === "replace") events = incoming;
          else {
            const max = Math.max(
              0,
              ...events.map((e) => Number(e.id.slice(1))),
            );
            events = [
              ...events,
              ...incoming.map((e, i) => ({ ...e, id: `e${max + i + 1}` })),
            ];
          }
        }
        const answers = task.purpose === "replace" ? {} : { ...prev.answers };
        if (task.op.kind === "answers")
          for (const a of task.op.answers) {
            for (const key of Object.keys(answers))
              if (
                key.endsWith(`:${a.eventId}:${a.field}`) ||
                key === `edit-text-${a.eventId}`
              )
                delete answers[key];
          }
        return {
          ...prev,
          events,
          sources:
            task.purpose === "replace"
              ? sources
              : [...prev.sources, ...sources],
          step: task.purpose === "append" && prev.step === 2 ? 2 : 1,
          deferred: task.purpose === "replace" ? [] : prev.deferred,
          answers,
          extra: task.purpose === "patch" ? prev.extra : "",
          lastProvider: result.provider,
          lastCalls: result.calls,
        };
      });
      setPending(null);
      setOffset(0);
      focusWorkflow();
    } catch (e) {
      if (version === generation.current)
        setError(
          e instanceof Error &&
            e.name !== "AbortError" &&
            e.name !== "TimeoutError"
            ? e.message
            : "処理を中止したか、待ち時間を超えました。入力は残っています。",
        );
    } finally {
      if (version === generation.current) setBusy(false);
    }
  };
  const answer = (q: Issue) => {
    const text = state.answers[q.id];
    if (q.kind === "add") prepare({ kind: "extract", text }, "append");
    else if (q.eventId && q.field)
      prepare(
        {
          kind: "answers",
          answers: [{ eventId: q.eventId, field: q.field, text }],
        },
        "patch",
      );
  };
  const edit = (id: string, field: Field, text: string) =>
    prepare(
      { kind: "answers", answers: [{ eventId: id, field, text }] },
      "patch",
    );
  const result = analyze(state.events, state.context);
  const isSample = samples.some((s) => s.text === state.text);
  const loadSample = (i: number) => {
    const s = samples[i];
    change({
      text: s.text,
      mode: "mock",
      step: 0,
      context: {
        ...state.context,
        firstVisit: s.firstVisit,
        onset: s.onset,
        currentHospital: s.currentHospital,
        illness: "",
      },
    });
    setSelected("");
    setPending(null);
    setError("");
    requestAnimationFrame(() => {
      document.getElementById("input-title")?.focus({ preventScroll: true });
      document
        .getElementById("input-title")
        ?.closest("section")
        ?.scrollIntoView({ block: "start" });
    });
  };
  const writeOwn = () => {
    preferInputFocus.current = state.step !== 0;
    // 見本からの切り替えだけ見本を片付ける。本人の入力は保持する。
    if (isSample)
      setState({
        ...fresh(),
        mode: config.provider === "openai" ? "live" : "mock",
      });
    else
      change({ step: 0, mode: config.provider === "openai" ? "live" : "mock" });
    setSelected("");
    setOffset(0);
    setPending(null);
    setError("");
    requestAnimationFrame(() => document.getElementById("history")?.focus());
  };
  const clear = () => {
    if (!window.confirm("この端末の経過・回答・下書きをすべて消しますか？"))
      return;
    cancel();
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setState(fresh());
    setSelected("");
    setOffset(0);
    setError("");
    setStorageError("");
  };
  return (
    <>
      <a className="skip" href="#main">
        本文へ移動
      </a>
      <header className="app-header">
        <a className="brand" href="/">
          <span className="brand-leaf" aria-hidden="true" />
          <span>
            あゆみの下書き<small>障害年金の病歴・就労状況等申立書の準備</small>
          </span>
        </a>
        <span className="badge">学生AIハッカソン（試作）</span>
        {samples.some(
          (s) => s.text === state.text || s.text === state.sources[0],
        ) && <span className="example-badge">記入例（架空）</span>}
        <a
          className="help-link"
          href="#guide"
          onClick={() => {
            const guide = document.getElementById("guide");
            if (guide instanceof HTMLDetailsElement) guide.open = true;
          }}
        >
          使い方
        </a>
      </header>
      <main id="main" className={`app-main step-${state.step}`}>
        <nav
          ref={workflow}
          tabIndex={-1}
          aria-label="作業の手順"
          className="workflow no-print"
        >
          <p className="step-status" aria-live="polite">
            手順 {state.step + 1} / 3
          </p>
          <ol className="steps">
            {steps.map((label, i) => (
              <li key={label}>
                <button
                  aria-current={state.step === i ? "step" : undefined}
                  disabled={busy || (i > 0 && !state.events.length)}
                  onClick={() => {
                    change({ step: i });
                    setPending(null);
                    if (i === 0) setSelected("");
                    focusWorkflow();
                  }}
                >
                  <span>{i + 1}</span>
                  {label}
                </button>
                {i < 2 && (
                  <span className="step-arrow" aria-hidden="true">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {state.step === 0 && (
          <section className="welcome no-print" aria-label="はじめに">
            <div className="intro">
              <div>
                <p className="eyebrow">書けることから、少しずつ。</p>
                <h1 className="welcome-title">
                  <span>あなたの経過を、</span>
                  <span>伝わる下書きに。</span>
                </h1>
                <p>
                  障害年金の申立書に向けて、病歴や生活の様子を期間ごとに整理します。
                </p>
              </div>
              <div className="entry-actions">
                <button
                  className="sample-link"
                  disabled={busy}
                  onClick={() => loadSample(0)}
                  aria-describedby="sample-help"
                >
                  見本で試す
                </button>
                <p id="sample-help" className="small">
                  架空の経過が入り、AI を使わず最後まで試せます。
                </p>
              </div>
            </div>
            <CostNotice />
            <button className="text-button" disabled={busy} onClick={writeOwn}>
              自分の経過を書く
            </button>
          </section>
        )}
        {state.events.length > 0 && state.sources[0] !== state.text && (
          <p className="notice no-print">
            経過の文が変わっています。下書きは前の文をもとにしています。「経過を書く」から整理し直すと置き換わります。
          </p>
        )}
        {storageError && (
          <p role="alert" className="error">
            {storageError}
          </p>
        )}
        <div className="work-layout">
          <aside className="work-sidebar">
            <div
              className={
                showTimeline
                  ? "timeline-container expanded"
                  : "timeline-container"
              }
            >
              {state.step === 1 && (
                <button
                  className="timeline-toggle"
                  aria-expanded={showTimeline}
                  aria-controls="timeline"
                  onClick={() => setShowTimeline(!showTimeline)}
                >
                  {showTimeline ? "期間の一覧を閉じる" : "期間の一覧を見る"}
                </button>
              )}
              <Timeline
                disabled={busy}
                events={result.events}
                issues={state.events.length ? result.issues : []}
                selected={selected}
                select={(id) => {
                  setPending(null);
                  setSelected(id);
                  if (state.step === 2 && id.startsWith("e"))
                    requestAnimationFrame(() =>
                      document.getElementById(`period-${id}`)?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      }),
                    );
                  else if (id && !id.startsWith("e")) {
                    change({
                      step: 1,
                      deferred: state.deferred.filter((key) => key !== id),
                    });
                    setOffset(
                      Math.max(
                        0,
                        result.issues
                          .filter(
                            (q) =>
                              q.id === id || !state.deferred.includes(q.id),
                          )
                          .findIndex((q) => q.id === id),
                      ),
                    );
                  }
                }}
              />
            </div>
          </aside>
          <div className="work-content">
            <div className={busy ? "busy-area" : ""} aria-busy={busy}>
              <fieldset disabled={busy} className="workspace">
                <legend className="sr-only">下書きの作成</legend>
                {state.step === 0 && (
                  <Input
                    state={state}
                    change={change}
                    selected={selected}
                    edit={edit}
                    sample={loadSample}
                    aiAvailable={config.provider === "openai"}
                    prepare={() =>
                      prepare({ kind: "extract", text: state.text }, "replace")
                    }
                  />
                )}
                {state.step === 1 && (
                  <Questions
                    events={result.events}
                    issues={result.issues}
                    deferred={state.deferred}
                    answers={state.answers}
                    setAnswer={(id, value) =>
                      change({ answers: { ...state.answers, [id]: value } })
                    }
                    offset={offset}
                    setOffset={setOffset}
                    answer={answer}
                    defer={(id) =>
                      change({
                        deferred: [...new Set([...state.deferred, id])],
                      })
                    }
                    finish={() => {
                      change({ step: 2 });
                      setPending(null);
                    }}
                  />
                )}
                {state.step === 2 && (
                  <Draft
                    restart={() => {
                      change({ step: 0 });
                      setSelected("");
                      setPending(null);
                      focusWorkflow();
                    }}
                    writeOwn={writeOwn}
                    selected={selected}
                    state={state}
                    events={result.events}
                    issues={result.issues}
                    change={change}
                    edit={edit}
                    remove={(id) => {
                      if (
                        window.confirm(
                          "この期間を下書きから削除しますか？元の文は残ります。",
                        )
                      )
                        change({
                          events: state.events.filter((e) => e.id !== id),
                          deferred: state.deferred.filter(
                            (key) => !key.split(":").includes(id),
                          ),
                        });
                    }}
                    add={() =>
                      prepare({ kind: "extract", text: state.extra }, "append")
                    }
                  />
                )}
              </fieldset>
            </div>
            <div ref={panel} className="no-print">
              {pending && (
                <SendPanel
                  key={JSON.stringify(pending) + state.mode}
                  op={pending.op}
                  step={state.step}
                  returnsToDraft={
                    pending.purpose === "append" && state.step === 2
                  }
                  mode={state.mode}
                  destination={config.destination}
                  busy={busy}
                  submit={send}
                  cancel={cancel}
                />
              )}
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <div className="save-row no-print">
              <span
                className={saved ? "save-state saved" : "save-state"}
                role="status"
              >
                {saved ? "✓ 途中まで保存済み" : "保存を確認中"}
              </span>
              <button onClick={() => setResting(true)}>
                <Icon name="bookmark" /> 保存して休む
              </button>
            </div>
            {resting && (
              <section
                className="rest-panel no-print"
                role="region"
                aria-label="休憩"
              >
                <h2>
                  {saved
                    ? "続きは、またここから。"
                    : "保存状態を確認してください"}
                </h2>
                <p>
                  {saved
                    ? "この端末の同じブラウザーで開くと、途中から再開できます。今は画面を閉じても大丈夫です。"
                    : "この端末に保存できていません。画面を閉じる前に下書きを印刷してください。"}
                </p>
                <button className="primary" onClick={() => setResting(false)}>
                  続きを書く
                </button>
              </section>
            )}
          </div>
        </div>
        <nav className="bottom-nav no-print" aria-label="補助メニュー">
          <a href="#timeline" onClick={() => setShowTimeline(true)}>
            <Icon name="timeline" />
            時間をたどる
          </a>
          <a
            href="#guide"
            onClick={() => {
              const guide = document.getElementById("guide");
              if (guide instanceof HTMLDetailsElement) guide.open = true;
            }}
          >
            <Icon name="document" />
            申立書の見方
          </a>
          <a
            href="#settings"
            onClick={() => {
              const settings = document.getElementById("settings");
              if (settings instanceof HTMLDetailsElement) settings.open = true;
            }}
          >
            <Icon name="settings" />
            設定
          </a>
        </nav>
        <details className="settings no-print" id="settings">
          <summary>設定と保存について</summary>
          <div className="mode no-print">
            <label>
              整理の方法
              <select
                disabled={busy}
                value={state.mode}
                onChange={(e) => {
                  setPending(null);
                  change({ mode: e.target.value as State["mode"] });
                }}
              >
                <option value="mock">AI を使わず試す（この端末で整理）</option>
                <option value="live" disabled={config.provider !== "openai"}>
                  AI で整理する
                  {config.provider !== "openai" ? "（今は利用できません）" : ""}
                </option>
              </select>
            </label>
            <p className="small">
              AI
              を使わない方法は、見本以外の入力でも試せます。複雑な文は分けて書くと確かめやすくなります。
            </p>
          </div>
          <div className="utility">
            <p className="small">
              共用端末では、終わったら消してください。ブラウザーの保存領域は暗号化していません。
            </p>
            <button className="text-button danger" onClick={clear}>
              保存した内容を消す
            </button>
          </div>
        </details>
        <div className="no-print">
          <details id="guide">
            <summary>申立書の見方・使い方</summary>
            <p>
              1. 経過を書く（見本あり） → 2. 期間と聞き返しに答える → 3.
              様式の順の下書きを見る。下書きは印刷して相談にも使えます。
            </p>
            <p>
              日付が曖昧なところは未確認のまま残せます。保存して休んだ後は、期間の一覧を手がかりに続きを書けます。
            </p>
          </details>
          <Sources />
          <details>
            <summary>文章の整理と、日付などの確認について</summary>
            <dl>
              <dt>文章の整理（AI または端末内の簡単な処理）</dt>
              <dd>
                本人の文を期間と欄に振り分け、原文の引用を添えます。本人の回答も同じ形に整理します。
              </dd>
              <dt>決まった手順での確認</dt>
              <dd>
                整理した内容を元の文と照らし合わせ、日付の前後・抜けた期間・重なり・受診先・初診日との食い違いを確認。長い期間の区切り候補と聞き返しを作ります。
              </dd>
              <dt>本人・専門家</dt>
              <dd>
                内容の正しさ、初診日の証明、制度の扱い、提出する用紙を確かめます。
              </dd>
            </dl>
          </details>
        </div>
      </main>
      <footer>
        あゆみの下書き · 2026
        <br />
        書けることから、少しずつ。
      </footer>
    </>
  );
}
