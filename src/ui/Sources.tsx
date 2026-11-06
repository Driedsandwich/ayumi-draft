import { sources } from "../core/sources";
export function Sources() {
  return (
    <details className="sources">
      <summary>使っている公式の様式と決まり</summary>
      <p>
        2026年11月6日に確認。発病から現在まで空白なく記載し、受診先・受診の有無で分けます。5年を超える期間は3〜5年ごとの区切りを検討します。
      </p>
      <p>
        年月しか分からない日付は、日を補いません。同日の境界や同時受診は、誤りと断定せず確認事項にします。20歳前の初診などの記載簡素化は自動で適用しません。
      </p>
      <ul>
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
