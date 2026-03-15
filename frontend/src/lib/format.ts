const DEFAULT_STORE_LOCALE = process.env.NEXT_PUBLIC_STORE_LOCALE?.trim() || "es-AR";
const DEFAULT_STORE_CURRENCY_CODE =
  process.env.NEXT_PUBLIC_STORE_CURRENCY_CODE?.trim().toUpperCase() || "USD";

const formatterCache = new Map<string, Intl.NumberFormat>();

function normalizeCurrencyCode(input: unknown, fallback: string) {
  if (typeof input !== "string") return fallback;
  const raw = input.trim().toUpperCase();
  if (!raw) return fallback;
  return /^[A-Z]{3}$/.test(raw) ? raw : fallback;
}

function normalizeLocale(input: unknown, fallback: string) {
  if (typeof input !== "string") return fallback;
  const raw = input.trim();
  if (!raw) return fallback;

  const match = raw.match(/^([a-zA-Z]{2})(?:[-_ ]?([a-zA-Z]{2}))?$/);
  if (!match) return fallback;
  const language = match[1].toLowerCase();
  const region = match[2] ? match[2].toUpperCase() : "";
  return region ? `${language}-${region}` : language;
}

function readRuntimeSetting(name: "storeLocale" | "storeCurrencyCode") {
  if (typeof document === "undefined") return "";
  const value = document.body?.dataset?.[name];
  return typeof value === "string" ? value : "";
}

function getRuntimeLocale() {
  return normalizeLocale(readRuntimeSetting("storeLocale"), DEFAULT_STORE_LOCALE);
}

function getRuntimeCurrencyCode() {
  return normalizeCurrencyCode(
    readRuntimeSetting("storeCurrencyCode"),
    DEFAULT_STORE_CURRENCY_CODE
  );
}

function getMoneyFormatter(input: {
  locale: string;
  currencyCode: string;
  maximumFractionDigits: number;
}) {
  const key = `${input.locale}|${input.currencyCode}|${input.maximumFractionDigits}`;
  const existing = formatterCache.get(key);
  if (existing) return existing;

  const created = new Intl.NumberFormat(input.locale, {
    style: "currency",
    currency: input.currencyCode,
    maximumFractionDigits: input.maximumFractionDigits,
  });

  formatterCache.set(key, created);
  return created;
}

export type MoneyFormatOptions = {
  locale?: string;
  currencyCode?: string;
  maximumFractionDigits?: number;
};

export function formatMoney(value: number, options: MoneyFormatOptions = {}) {
  const safe = Number.isFinite(value) ? value : 0;

  const locale = normalizeLocale(options.locale, getRuntimeLocale());
  const currencyCode = normalizeCurrencyCode(
    options.currencyCode,
    getRuntimeCurrencyCode()
  );
  const maximumFractionDigits =
    typeof options.maximumFractionDigits === "number" &&
    Number.isFinite(options.maximumFractionDigits)
      ? Math.max(0, Math.min(6, Math.trunc(options.maximumFractionDigits)))
      : 0;

  return getMoneyFormatter({ locale, currencyCode, maximumFractionDigits }).format(safe);
}

export function formatMoneyToParts(
  value: number,
  options: MoneyFormatOptions = {}
) {
  const safe = Number.isFinite(value) ? value : 0;

  const locale = normalizeLocale(options.locale, getRuntimeLocale());
  const currencyCode = normalizeCurrencyCode(
    options.currencyCode,
    getRuntimeCurrencyCode()
  );
  const maximumFractionDigits =
    typeof options.maximumFractionDigits === "number" &&
    Number.isFinite(options.maximumFractionDigits)
      ? Math.max(0, Math.min(6, Math.trunc(options.maximumFractionDigits)))
      : 0;

  return getMoneyFormatter({
    locale,
    currencyCode,
    maximumFractionDigits,
  }).formatToParts(safe);
}

export function getStoreCurrencyCode(options: { currencyCode?: string } = {}) {
  return normalizeCurrencyCode(options.currencyCode, getRuntimeCurrencyCode());
}

export function toNumberOrUndefined(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}
