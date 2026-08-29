const TIME_ZONE = "America/Sao_Paulo";
const DAY_MS = 86_400_000;

export type DateRangeInput = { range?: "today" | "7d" | "30d" | "custom"; from?: string; to?: string };
export type DateInterval = { preset: "today" | "7d" | "30d" | "custom"; from: Date; toExclusive: Date; displayFrom: string; displayTo: string; timeZone: typeof TIME_ZONE };

export class DateRangeError extends Error {}

function partsAt(date: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

function localDate(date: Date): string {
  const value = partsAt(date);
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function parseDate(value: string): [number, number, number] {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) throw new DateRangeError("Dates must use YYYY-MM-DD.");
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) throw new DateRangeError("The date is not valid.");
  return [year, month, day];
}

function addDays(value: string, days: number): string {
  const [year, month, day] = parseDate(value);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function saoPauloMidnightUtc(value: string): Date {
  const [year, month, day] = parseDate(value);
  const desired = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidate = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const local = partsAt(new Date(candidate));
    const rendered = Date.UTC(local.year!, local.month! - 1, local.day!, local.hour!, local.minute!, local.second!);
    candidate += desired - rendered;
  }
  return new Date(candidate);
}

export function resolveDateRange(input: DateRangeInput, now = new Date()): DateInterval {
  const preset = input.range ?? "7d";
  const today = localDate(now);
  let displayFrom: string;
  let displayTo: string;
  if (preset === "custom") {
    if (!input.from || !input.to) throw new DateRangeError("Custom ranges require from and to dates.");
    parseDate(input.from); parseDate(input.to);
    if (input.from > input.to) throw new DateRangeError("The start date must not be after the end date.");
    displayFrom = input.from; displayTo = input.to;
  } else {
    const days = preset === "today" ? 1 : preset === "7d" ? 7 : 30;
    displayFrom = addDays(today, -(days - 1)); displayTo = today;
  }
  const from = saoPauloMidnightUtc(displayFrom);
  const toExclusive = saoPauloMidnightUtc(addDays(displayTo, 1));
  const spanDays = Math.round((Date.UTC(...parseDate(displayTo).map((value, index) => index === 1 ? value - 1 : value) as [number, number, number]) - Date.UTC(...parseDate(displayFrom).map((value, index) => index === 1 ? value - 1 : value) as [number, number, number])) / DAY_MS) + 1;
  if (spanDays > 366) throw new DateRangeError("Date ranges are limited to 366 days.");
  return { preset, from, toExclusive, displayFrom, displayTo, timeZone: TIME_ZONE };
}
