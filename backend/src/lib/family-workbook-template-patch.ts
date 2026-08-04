import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import * as XLSX from "xlsx";

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/**
 * Put values into the original XLSX package, instead of serialising the
 * workbook through SheetJS. SheetJS CE does not round-trip styles reliably;
 * patching only cell XML keeps the template's fills, borders, formulas,
 * merged ranges, widths and drawings byte-for-byte intact.
 */
export function patchFamilyTemplate(template: Buffer, generated: XLSX.WorkBook): Buffer {
  const archive = unzipSync(new Uint8Array(template));
  for (let sheetIndex = 0; sheetIndex < 12; sheetIndex++) {
    const sheetName = generated.SheetNames[sheetIndex];
    const sheet = sheetName ? generated.Sheets[sheetName] : undefined;
    const file = archive[`xl/worksheets/sheet${sheetIndex + 1}.xml`];
    if (!sheet || !file) continue;
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    let content = strFromU8(file);
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })] as XLSX.CellObject | undefined;
        // Export ordinary input cells only. Formula cells must remain untouched
        // so Excel can recalculate them after the user changes an input.
        if (!cell || cell.v === undefined || cell.v === "") continue;
        if (cell.f) continue;
        const ref = XLSX.utils.encode_cell({ r: row, c: col });
        const value = String(cell.v);
        const numeric = typeof cell.v === "number" && Number.isFinite(cell.v);
        const cellPattern = new RegExp(`<c\\b([^>]*\\br="${ref}"[^>]*)>(?:[\\s\\S]*?<\\/c>)?`);
        content = content.replace(cellPattern, (_whole, rawAttrs: string) => {
          // Keep the template's style index and every other cell attribute.
          const attrs = rawAttrs.replace(/\s+t="[^"]*"/g, "");
          return numeric
            ? `<c${attrs} t="n"><v>${cell.v}</v></c>`
            : `<c${attrs} t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
        });
      }
    }
    archive[`xl/worksheets/sheet${sheetIndex + 1}.xml`] = strToU8(content);
  }
  return Buffer.from(zipSync(archive, { level: 6 }));
}
