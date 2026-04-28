import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

export function csvEscape(v: string | number | null | undefined): string {
  if (v == null) return "";
  let safe = String(v);
  if (/^[=+\-@\t\r]/.test(safe)) safe = "'" + safe;
  const needsQuotes = /[",\n\r]/.test(safe);
  const escaped = safe.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function downloadCSV(filename: string, rows: (string | number | null | undefined)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
