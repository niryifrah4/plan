import fs from 'fs';
const buf = fs.readFileSync('/Users/niryifrah/Desktop/ליווים/יעל גוסין /עו״ש.xls');
const text = buf.toString('utf8');
console.log('has <table>:', /<table/i.test(text));
console.log('has </table>:', /<\/table>/i.test(text));
// strip per current logic
const stripped = text
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<table[\s\S]*?<\/table>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/[\u200E\u200F]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
console.log('stripped len:', stripped.length);
console.log('stripped:', stripped.slice(0, 500));
console.log('contains ישראכרט:', stripped.includes('ישראכרט'));
