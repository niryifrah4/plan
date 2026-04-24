import fs from 'fs';
import * as XLSX from 'xlsx';
const f = process.argv[2];
const buf = fs.readFileSync(f);
// HTML detection
const head = buf.slice(0, 500).toString('utf8');
const isHtml = /<html/i.test(head);
console.log('=== FILE:', f.split('/').pop());
console.log('size:', buf.length, '| HTML-as-XLS:', isHtml);
if (isHtml) {
  // mimic html parser
  const text = buf.toString('utf8');
  const trRx = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let m;
  while ((m = trRx.exec(text)) !== null) {
    const cells = [];
    const tdRx = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let tm;
    while ((tm = tdRx.exec(m[1])) !== null) {
      const c = tm[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/[\r\n]+/g,' ').trim();
      cells.push(c);
    }
    if (cells.length >= 2) rows.push(cells);
  }
  console.log('rows:', rows.length);
  rows.slice(0, 20).forEach((r,i) => console.log(i, '|', r.join(' || ').slice(0,200)));
} else {
  const wb = XLSX.read(buf, { type: 'buffer' });
  for (const name of wb.SheetNames) {
    console.log('--- sheet:', name);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false });
    console.log('rows:', rows.length);
    rows.slice(0, 25).forEach((r,i) => console.log(i, '|', r.join(' || ').slice(0,200)));
  }
}
