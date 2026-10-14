// Dates as the Gantt chart reads and writes them, all in UTC, as milliseconds since the epoch.

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FIELDS: Record<string, string> = {
  YYYY: "(\\d{4})",
  YY: "(\\d{2})",
  MM: "(\\d{2})",
  M: "(\\d{1,2})",
  DD: "(\\d{2})",
  D: "(\\d{1,2})",
  HH: "(\\d{2})",
  H: "(\\d{1,2})",
  mm: "(\\d{2})",
  m: "(\\d{1,2})",
  ss: "(\\d{2})",
  s: "(\\d{1,2})",
  SSS: "(\\d{3})",
  X: "(\\d+)",
  x: "(\\d+)",
};

const TOKEN = /YYYY|YY|MM|M|DD|D|HH|H|mm|m|ss|s|SSS|X|x/g;

// A date written in a moment.js style `format` such as `YYYY-MM-DD HH:mm`, or null where the text does not fit it.
export function parseDate(text: string, format: string): number | null {
  const names: string[] = [];
  const pattern = format.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(TOKEN, (token) => {
    names.push(token);
    return FIELDS[token]!;
  });
  const match = new RegExp(`^${pattern}$`).exec(text.trim());

  if (match === null) {
    return null;
  }

  const part = (token: string, fallback: number) => {
    const at = names.indexOf(token);

    return at === -1 ? fallback : Number(match[at + 1]);
  };

  if (names.includes("X")) {
    return part("X", 0) * 1000;
  }

  if (names.includes("x")) {
    return part("x", 0);
  }

  const short = names.includes("YY") ? 2000 + part("YY", 0) : 1970;
  const year = names.includes("YYYY") ? part("YYYY", 1970) : short;
  const month = names.includes("MM") ? part("MM", 1) : part("M", 1);
  const day = names.includes("DD") ? part("DD", 1) : part("D", 1);
  const hour = names.includes("HH") ? part("HH", 0) : part("H", 0);
  const minute = names.includes("mm") ? part("mm", 0) : part("m", 0);
  const second = names.includes("ss") ? part("ss", 0) : part("s", 0);
  const value = Date.UTC(year, month - 1, day, hour, minute, second, part("SSS", 0));

  return Number.isNaN(value) || month < 1 || month > 12 || day < 1 || day > 31 ? null : value;
}

const UNIT = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w|M|y)$/;

// A date a duration such as `10d`, `1.5h` or `2M` after `from`, or null where the text is no duration.
export function addDuration(from: number, text: string): number | null {
  const match = UNIT.exec(text.trim());

  if (match === null) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2]!;
  const wholeMonths = unit === "M" ? amount : unit === "y" ? amount * 12 : 0;

  if (wholeMonths > 0) {
    const date = new Date(from);
    const months = Math.trunc(wholeMonths);

    return Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      date.getUTCDate(),
      date.getUTCHours(),
      date.getUTCMinutes(),
    );
  }

  const size = { ms: 1, s: 1000, m: 60_000, h: HOUR, d: DAY, w: 7 * DAY }[unit]!;

  return from + amount * size;
}

const two = (value: number): string => String(value).padStart(2, "0");

// A date in a d3 style `format` such as `%b %e` or `%Y-%m-%d`, for the specifiers a chart axis uses.
export function formatDate(ms: number, format: string): string {
  const date = new Date(ms);
  const fields: Record<string, string> = {
    Y: String(date.getUTCFullYear()),
    y: two(date.getUTCFullYear() % 100),
    m: two(date.getUTCMonth() + 1),
    d: two(date.getUTCDate()),
    e: String(date.getUTCDate()).padStart(2, " "),
    b: MONTHS[date.getUTCMonth()]!.slice(0, 3),
    B: MONTHS[date.getUTCMonth()]!,
    a: WEEKDAYS[date.getUTCDay()]!.slice(0, 3),
    A: WEEKDAYS[date.getUTCDay()]!,
    H: two(date.getUTCHours()),
    I: two(date.getUTCHours() % 12 || 12),
    M: two(date.getUTCMinutes()),
    S: two(date.getUTCSeconds()),
    p: date.getUTCHours() < 12 ? "AM" : "PM",
    "%": "%",
  };

  return format.replace(/%([-_0]?)([A-Za-z%])/g, (whole, flag: string, key: string) => {
    const value = fields[key];

    if (value === undefined) {
      return whole;
    }

    return flag === "-" ? value.replace(/^[0 ]/, "") : value;
  });
}

// The steps a time axis may take between ticks, smallest first: a length and, for months and years, the number of months.
const STEPS: readonly { ms: number; months: number }[] = [
  ...[1, 2, 3, 6, 12].map((hours) => ({ ms: hours * HOUR, months: 0 })),
  ...[1, 2, 7, 14].map((days) => ({ ms: days * DAY, months: 0 })),
  ...[1, 2, 3, 6, 12, 24, 60].map((months) => ({ ms: 0, months })),
];

// Ticks from `from` to `to`, no more than `count`, at the smallest step that keeps them that few and on round times.
export function timeTicks(from: number, to: number, count: number): { ticks: number[]; isShort: boolean } {
  for (const step of STEPS) {
    const ticks: number[] = [];

    if (step.months > 0) {
      const start = new Date(from);
      let cursor = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1);

      for (let n = 0; cursor <= to && n < 1000; n++) {
        if (cursor >= from) {
          ticks.push(cursor);
        }

        const at = new Date(cursor);

        cursor = Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + step.months, 1);
      }
    } else {
      const anchor = step.ms === 7 * DAY || step.ms === 14 * DAY ? 4 * DAY : 0;

      for (
        let at = Math.ceil((from - anchor) / step.ms) * step.ms + anchor;
        at <= to && ticks.length <= count;
        at += step.ms
      ) {
        ticks.push(at);
      }
    }

    if (ticks.length <= count && (ticks.length >= 2 || step === STEPS.at(-1))) {
      return { ticks, isShort: step.months === 0 && step.ms < DAY };
    }
  }

  return { ticks: [], isShort: false };
}
