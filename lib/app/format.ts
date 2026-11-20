import type { Locale } from "./api/types";

const MONTHS_LONG = {
  mk: ["јануари", "февруари", "март", "април", "мај", "јуни", "јули", "август", "септември", "октомври", "ноември", "декември"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

/** "12 октомври", "12 October": the day and the whole month, by hand like formatDate. */
export function formatLongDate(ms: number, locale: Locale) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_LONG[locale][d.getMonth()]}`;
}

const MONTHS = {
  mk: ["јан", "фев", "мар", "апр", "мај", "јун", "јул", "авг", "сеп", "окт", "ное", "дек"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// Hand-rolled instead of toLocaleDateString: Node and the browser disagree on Macedonian
// month names, which is a hydration mismatch.
export function formatDate(ms: number, locale: Locale) {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS[locale][d.getMonth()]}`;
}

/** Thousands grouped the local way (1.480 in Macedonian, 1,480 in English), by hand for the same reason. */
export function formatPoints(n: number, locale: Locale) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, locale === "mk" ? "." : ",");
}

export function formatTime(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** A file's size as a person reads it: "12 B", "240 KB", "1,5 MB" (a comma in Macedonian). Units of 1024, a megabyte to one decimal. */
export function formatSize(bytes: number, locale: Locale) {
  if (bytes < 1024) return `${Math.max(0, Math.floor(bytes))} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = (Math.round((bytes / (1024 * 1024)) * 10) / 10).toString();
  return `${locale === "mk" ? mb.replace(".", ",") : mb} MB`;
}
