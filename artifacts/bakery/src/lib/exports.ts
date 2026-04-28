import * as XLSX from "xlsx";
import { todayLocalISO } from "@/lib/utils";

export type Sheet = {
  name: string;
  rows: Array<Record<string, string | number | null | undefined>>;
};

function sanitizeSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no : \ / ? * [ ]
  return name.replace(/[:\\/?*[\]]/g, "-").slice(0, 31) || "Sheet";
}

export function downloadXLSX(filename: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    let name = sanitizeSheetName(s.name);
    let n = 2;
    while (used.has(name)) {
      const suffix = ` (${n++})`;
      name = sanitizeSheetName(s.name).slice(0, 31 - suffix.length) + suffix;
    }
    used.add(name);
    const ws = XLSX.utils.json_to_sheet(
      s.rows.length > 0 ? s.rows : [{ "(no data)": "" }],
    );
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const safeName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(wb, safeName);
}

export function timestampedFilename(base: string): string {
  return `${base}-${todayLocalISO()}.xlsx`;
}
