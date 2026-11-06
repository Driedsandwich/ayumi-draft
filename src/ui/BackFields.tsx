import { blankSnapshot, type State, type Snapshot } from "../client/storage";
export const activities = [
  "着替え",
  "洗面",
  "トイレ",
  "入浴",
  "食事",
  "散歩",
  "炊事",
  "洗濯",
  "掃除",
  "買い物",
];
export function BackFields({
  state,
  change,
}: {
  state: State;
  change: (s: Partial<State>) => void;
}) {
  const update = (index: number, s: Snapshot) => {
    const snapshots = [...state.snapshots] as [Snapshot, Snapshot];
    snapshots[index] = s;
    change({ snapshots });
  };
  return (
    <section className="back-fields">
      <h3>就労・日常生活状況（裏面のための本人メモ）</h3>
      <p className="small">
        ここは本人が直接記入します。AI
        には送りません。障害認定日や必要な欄は年金事務所などで確認してください。空欄のままでも下書きを印刷できます。
      </p>
      <label>
        確認した障害認定日（分からなければ空欄）
        <input
          maxLength={100}
          value={state.recognitionDate}
          onChange={(e) => change({ recognitionDate: e.target.value })}
        />
      </label>
      {["1. 障害認定日頃の状況", "2. 現在（請求日頃）の状況"].map(
        (title, index) => {
          const snap = state.snapshots[index] || blankSnapshot();
          return (
            <details key={title}>
              <summary>{title}</summary>
              <div className="form-grid">
                {(
                  [
                    ["job", "職種（仕事の内容）"],
                    ["commute", "通勤方法・通勤時間（片道）"],
                    ["days", "出勤日数（前月・前々月）"],
                    ["condition", "仕事中や仕事が終わった時の身体の調子"],
                    ["noWork", "仕事をしていなかった・休職していた理由"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={snap[key]}
                      onChange={(e) =>
                        update(index, { ...snap, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
              </div>
              <h4>日常生活の制限（本人の選択）</h4>
              <div className="form-grid">
                {activities.map((a) => (
                  <label key={a}>
                    {a}
                    <select
                      value={snap.daily[a] || ""}
                      onChange={(e) =>
                        update(index, {
                          ...snap,
                          daily: { ...snap.daily, [a]: e.target.value },
                        })
                      }
                    >
                      <option value="">未記入・分からない</option>
                      <option>1 自発的にできる（できた）</option>
                      <option>2 援助が必要（必要だった）</option>
                      <option>3 援助があればできる（できた）</option>
                      <option>4 できない（できなかった）</option>
                    </select>
                  </label>
                ))}
              </div>
              <label>
                その他日常生活で不便に感じたこと
                <textarea
                  maxLength={2000}
                  value={snap.other}
                  onChange={(e) =>
                    update(index, { ...snap, other: e.target.value })
                  }
                />
              </label>
            </details>
          );
        },
      )}
      <label>
        障害者手帳（交付の有無・種類・交付年月日・等級・障害名のメモ）
        <textarea
          value={state.handbook}
          maxLength={2000}
          onChange={(e) => change({ handbook: e.target.value })}
        />
      </label>
      <p className="small">
        請求者・代筆者の氏名、住所、電話番号、続柄、申立日は、正式な用紙に記入してください。
      </p>
    </section>
  );
}
