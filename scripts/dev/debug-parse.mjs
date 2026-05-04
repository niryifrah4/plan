import fs from "fs";
const { matchSynonym } = await import("./lib/doc-parser/synonyms.ts");
const buf = fs.readFileSync("/Users/niryifrah/Desktop/ליווים/יעל גוסין /עו״ש.xls");
const text = buf.toString("utf8");
const trMatches = [...text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
const rows = trMatches
  .map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((x) =>
      x[1]
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/[\r\n]+/g, " ")
        .trim()
    )
  )
  .filter((r) => r.length >= 2);
const row = rows[6];
const detected = {};
for (let col = 0; col < row.length; col++) {
  const cell = String(row[col]).trim();
  if (!cell) continue;
  const field = matchSynonym(cell);
  console.log("col", col, JSON.stringify(cell), "→", field, "already?", detected[field]);
  if (field && !detected[field]) {
    detected[field] = col;
  }
}
console.log("FINAL:", detected);
