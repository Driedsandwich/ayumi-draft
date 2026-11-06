import type { Issue, Period } from "../core/types";

export const displayDate = (value: string | null) =>
  value?.replace(/(\d+)年(\d+)月(?:(\d+)日)?/g, (_, y, m, d) =>
    d ? `${y}/${m}/${d}` : `${y}/${m}`,
  ) || "未確認";
export const periodName = (p: Period) =>
  `${displayDate(p.start.value)} 〜 ${displayDate(p.end.value)}`;
export const gapIssues = (issues: Issue[]) =>
  issues.filter((q) => ["gap", "leading-gap", "trailing-gap"].includes(q.code));

export function Timeline({
  disabled = false,
  events,
  issues,
  selected,
  select,
}: {
  disabled?: boolean;
  events: Period[];
  issues: Issue[];
  selected: string;
  select: (id: string) => void;
}) {
  const gaps = gapIssues(issues);
  const gap = (q: Issue) => (
    <li className="timeline-gap" key={q.id}>
      <button
        disabled={disabled}
        aria-pressed={selected === q.id}
        onClick={() => select(q.id)}
      >
        <span className="tag unconfirmed">未確認の期間</span>
        <span>
          {q.code === "leading-gap"
            ? "発病から最初の期間"
            : q.code === "trailing-gap"
              ? "最後の期間から現在"
              : "この前の空白期間"}
        </span>
      </button>
    </li>
  );
  return (
    <nav id="timeline" className="timeline no-print" aria-label="時間をたどる">
      <h2>時間をたどる</h2>
      <p className="small">
        期間を選んで、できごと・受診・生活の様子を整理します。
      </p>
      <ol>
        {!events.length && (
          <li>
            <button
              disabled={disabled}
              aria-pressed="true"
              onClick={() => select("")}
            >
              これまでの経過<span className="small">思い出せるところから</span>
            </button>
          </li>
        )}
        {gaps.filter((q) => q.code === "leading-gap").map(gap)}
        {events.map((p, i) => (
          <li className="timeline-group" key={p.id}>
            <ol>
              {gaps
                .filter((q) => q.code === "gap" && q.eventId === p.id)
                .map(gap)}
              <li>
                <button
                  disabled={disabled}
                  aria-pressed={selected === p.id}
                  onClick={() => select(p.id)}
                >
                  <span className="timeline-index">期間 {i + 1}</span>
                  <span>{periodName(p)}</span>
                  <span className="small">
                    {p.care.value === "yes"
                      ? "受診あり"
                      : p.care.value === "no"
                        ? "受診なし"
                        : "受診は未確認"}
                  </span>
                </button>
              </li>
            </ol>
          </li>
        ))}
        {gaps.filter((q) => q.code === "trailing-gap").map(gap)}
      </ol>
      {!!events.length && (
        <button
          disabled={disabled}
          className="timeline-all"
          aria-pressed={!selected}
          onClick={() => select("")}
        >
          経過全体を見る
        </button>
      )}
    </nav>
  );
}
