import fs from 'fs';
const buf = fs.readFileSync('/Users/niryifrah/Desktop/ליווים/יעל גוסין /עו״ש.xls');
const text = buf.toString('utf8');
console.log('size:', buf.length);
console.log('starts with:', JSON.stringify(text.slice(0, 200)));
console.log('contains <html:', /<html/i.test(text.slice(0,500)));
// Count tr/td
console.log('tr count:', (text.match(/<tr/gi) || []).length);
console.log('td count:', (text.match(/<td/gi) || []).length);
console.log('th count:', (text.match(/<th/gi) || []).length);
// Show a few rows
const trMatches = [...text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
console.log('parsed rows:', trMatches.length);
trMatches.slice(5, 15).forEach((m, i) => {
  const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map(x => x[1].replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/[\r\n]+/g,' ').trim());
  console.log(i + 5, '|cells:', cells.length, '|', JSON.stringify(cells).slice(0, 250));
});
