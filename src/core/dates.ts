// Partial dates remain partial. Bounds are for comparison only, never written into the draft.
export type DateBounds = {
  min: number;
  max: number;
  precision: "day" | "month" | "year" | "current";
  iso: string;
};
const day = 86400000;
export function parseDate(
  raw: string | null,
  today = "2026-11-06",
): DateBounds | null {
  if (!raw) return null;
  const s = raw.trim().replace(/\s+/g, "");
  if (/^(現在|今|今日)$/.test(s)) {
    const p = parseDate(today);
    return p ? { ...p, precision: "current" } : null;
  }
  let y: number, m: number | undefined, d: number | undefined;
  const era = s.match(
    /^(昭和|平成|令和)(元|\d{1,2})年(?:(\d{1,2})月)?(?:(\d{1,2})日)?$/,
  );
  const jp = s.match(/^(\d{4})年(?:(\d{1,2})月)?(?:(\d{1,2})日)?$/);
  const iso = s.match(/^(\d{4})(?:[-/](\d{1,2})(?:[-/](\d{1,2}))?)?$/);
  if (era) {
    y =
      { 昭和: 1925, 平成: 1988, 令和: 2018 }[era[1]]! +
      (era[2] === "元" ? 1 : Number(era[2]));
    m = era[3] ? +era[3] : undefined;
    d = era[4] ? +era[4] : undefined;
  } else {
    const a = jp || iso;
    if (!a) return null;
    y = +a[1];
    m = a[2] ? +a[2] : undefined;
    d = a[3] ? +a[3] : undefined;
  }
  if (
    y < 1900 ||
    y > 2100 ||
    (d && !m) ||
    (m !== undefined && (m < 1 || m > 12)) ||
    (d !== undefined && (d < 1 || d > 31))
  )
    return null;
  const min = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  if (d && new Date(min).getUTCDate() !== d) return null;
  const max = d ? min : m ? Date.UTC(y, m, 0) : Date.UTC(y, 11, 31);
  if (era) {
    const ranges: Record<string, [number, number]> = {
      昭和: [Date.UTC(1926, 11, 25), Date.UTC(1989, 0, 7)],
      平成: [Date.UTC(1989, 0, 8), Date.UTC(2019, 3, 30)],
      令和: [Date.UTC(2019, 4, 1), Date.UTC(2100, 11, 31)],
    };
    const [lo, hi] = ranges[era[1]];
    if (max < lo || min > hi) return null;
  }
  return {
    min,
    max,
    precision: d ? "day" : m ? "month" : "year",
    iso: `${y}${m ? "-" + String(m).padStart(2, "0") : ""}${d ? "-" + String(d).padStart(2, "0") : ""}`,
  };
}
export const isoDay = (n: number) => new Date(n).toISOString().slice(0, 10);
export const nextDay = (n: number) => n + day;
export function isOverFiveYears(a: DateBounds, b: DateBounds) {
  const limit = new Date(a.max);
  limit.setUTCFullYear(limit.getUTCFullYear() + 5);
  return b.min > limit.getTime();
}
export function splitSuggestion(
  start: string | null,
  end: string | null,
  today: string,
): string[] {
  const a = parseDate(start, today),
    b = parseDate(end, today);
  if (!a || !b || !isOverFiveYears(a, b)) return [];
  if (
    !["day", "current"].includes(a.precision) ||
    !["day", "current"].includes(b.precision)
  )
    return ["年月日が分かってから、3〜5年ごとの区切りを相談してください。"];
  const rows: string[] = [];
  let at = a.min;
  while (at <= b.max) {
    const boundary = new Date(at);
    boundary.setUTCFullYear(boundary.getUTCFullYear() + 3);
    let stop = boundary.getTime() - day;
    if (stop >= b.max || b.max - stop < 3 * 365 * day) {
      const five = new Date(at);
      five.setUTCFullYear(five.getUTCFullYear() + 5);
      if (b.max <= five.getTime()) stop = b.max;
    }
    rows.push(`${isoDay(at)} 〜 ${isoDay(Math.min(stop, b.max))}`);
    at = stop + day;
    if (rows.length > 70) break;
  }
  return rows;
}
