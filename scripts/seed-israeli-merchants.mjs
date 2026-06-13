/**
 * Seed Israeli merchant → category rules into Supabase `merchant_category_votes`.
 *
 * Idempotent: tagged with source_file='seed:israeli-merchants-v1'. Re-running
 * first deletes that tagged batch, then re-inserts. Rows are inserted ONLY for
 * merchant keys that don't already have a winning rule (won't fight existing
 * user votes / prior seeds).
 *
 * merchant_key MUST equal getMerchantKey() output at runtime =
 * normalizeSupplier(desc).toLowerCase(). For chains added to SUPPLIER_GROUPS
 * the canonical (lower-cased) is the key; long-tail single-token brands match
 * when the description is essentially the brand name.
 *
 * Usage: node scripts/seed-israeli-merchants.mjs            (dry run — prints SQL)
 *        node scripts/seed-israeli-merchants.mjs --apply    (executes via psql)
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SEED_TAG = "seed:israeli-merchants-v1";
const CREATED_BY = "cec01553-b951-468c-a260-cd5e4a0fccc3"; // itayk93@gmail.com
const TX_COUNT = 800;

// category leaf keys: food housing transport utilities health education
// insurance leisure shopping salary pension transfers cash subscriptions
// refunds fees dining_out home_maintenance misc
const M = {
  // ── Supermarkets / groceries → food ──
  food: [
    "שופרסל", "רמי לוי", "ויקטורי", "יוחננוף", "טיב טעם", "יינות ביתן",
    "מגה בעיר", "מגה", "קרפור", "קרפור סיטי", "היפר קרפור", "קרפור מרקט",
    "אושר עד", "סיטי מרקט", "מחסני השוק", "חצי חינם", "נתיב החסד",
    "סופר יהודה", " am pm", "סטופ מרקט", "שוק העיר", "ברקת", "זול ובגדול",
    "קינג סטור", "פרש מרקט", "סופר ספיר", "בר כל", "מעדני", "טרא", "תנובה",
    "שטראוס", "אסם", "יטבתה", "וולט מרקט", "סופר דוש", "קופיקס מרקט",
  ],
  // ── Pharmacy / health funds / medical → health ──
  health: [
    "סופר פארם", "ניו פארם", "גוד פארם", "מכבי", "כללית", "מאוחדת", "לאומית",
    "בית מרקחת", "אסותא", "הרצליה מדיקל", "תרים", "פמי פרימיום", "אופטיקנה",
    "אירוקה", "erroca", "טבע", "ביטוח לאומי", "קופת חולים", "מד", "פלוס",
  ],
  // ── Fuel / transport / mobility → transport ──
  transport: [
    "פז", "סונול", "דלק", "דור אלון", "טן", "סד\"ש", "מנטה", "כביש 6",
    "נתיבי איילון", "פנגו", "סלופארק", "רב קב", "רב-קו", "אגד", "דן",
    "מטרופולין", "קווים", "רכבת ישראל", "גט", "gett", "יאנגו", "yango",
    "אובר", "uber", "מוביט", "moovit", "אוטוטל", "autotel", "קל אוטו",
    "אלדן", "שלמה sixt", "הרץ", "באבל דבל", "גרין", "go to", "שגריר",
    "טסט", "מוסך", "צמיגי", "טמבור חניון", "אחוזות החוף", "סיקסט",
  ],
  // ── Telecom / utilities → utilities ──
  utilities: [
    "פרטנר", "סלקום", "פלאפון", "הוט", "hot", "yes", "גולן טלקום", "019",
    "רמי לוי תקשורת", "בזק", "בזק בינלאומי", "סלקט", "אקספון", "we4g",
    "חברת חשמל", "מי אביבים", "מקורות", "הגיחון", "תאגיד מים", "מי שבע",
    "פרטנר tv", "סלקום tv", "נטוויז'ן", "012", "013",
  ],
  // ── Streaming / digital subscriptions → subscriptions ──
  subscriptions: [
    "נטפליקס", "netflix", "ספוטיפיי", "spotify", "דיסני", "disney",
    "יוטיוב", "youtube", "אפל", "apple", "google", "amazon prime", "max",
    "openai", "chatgpt", "claude", "anthropic", "microsoft", "office",
    "icloud", "dropbox", "canva", "linkedin", "notion", "github", "figma",
    "adobe", "audible", "patreon", "wix", "מנוי", "כאן", "סטינגריי",
  ],
  // ── Cafes / restaurants / food delivery → dining_out ──
  dining_out: [
    "ארומה", "קפה קפה", "קפה גרג", "גרג", "קפה ג'ו", "cafe joe", "לנדוור",
    "ארקפה", "רולדין", "קפה נמרוד", "מקדונלדס", "בורגר קינג", "בורגראנץ'",
    "burgeranch", "kfc", "דומינוס", "פיצה האט", "פאפא ג'ונס", "פיצה מטר",
    "ג'פניקה", "הומבורגר", "מוזס", "moses", "אגאדיר", "agadir", "bbb",
    "ג'ירף", "וולט", "wolt", "תן ביס", "10bis", "מקס ברנר", "וופל בר",
    "גולדה", "סבון", "סושי", "ג'מבו", "נפיס", "ארבע עונות", "שגב", "רחוב",
    "פרש קיטשן", "קלאב סנדוויץ'", "ביגה", "לחם ארז", "קופיקס", "קקאו",
    "הקצב", "פוקצ'טה", "מינה טומיי", "טאבולה", "ניני חכים", "סלינה",
  ],
  // ── Fashion / electronics / general retail → shopping ──
  shopping: [
    "זארה", "zara", "קסטרו", "castro", "פוקס", "fox", "רנואר", "renuar",
    "גולף", "golf", "אמריקן איגל", "h&m", "פול אנד בר", "ברשקה", "מנגו",
    "mango", "טרמינל איקס", "terminalx", "נקסט", "גאפ", "דלתא", "delta",
    "אינטימה", "סטיב מאדן", "אדידס", "adidas", "נייקי", "nike", "asos",
    "שיין", "shein", "עלי אקספרס", "aliexpress", "אמזון", "amazon", "איקאה",
    "ikea", "הום סנטר", "ace", "אייס", "נעמן", "כלי זמר", "ksp", "באג",
    "bug", "איוורי", "ivory", "מחסני חשמל", "שקם אלקטריק", "א.ל.מ", "אלקטרה",
    "מקס סטוק", "max stock", "פוטו", "lastprice", "payngo", "המשביר",
    "אופיס דיפו", "scoop", "סופר שוז", "אורבן", "ערוגות", "דיפלומט",
    " פנדורה", "סטימצקי", "צומת ספרים", "טוויסט", "ToysRus", "האפי",
  ],
  // ── Home / DIY / maintenance → home_maintenance ──
  home_maintenance: [
    "טמבור", "נגב קרמיקה", "ביתילי", "רהיטי", "ארדן", "חומרי בניין",
    "אינסטלציה", "חשמלאי", "צבעי", "מנעולן", "גנן", "ניקיון",
  ],
  // ── Insurance → insurance ──
  insurance: [
    "הפניקס", "מגדל", "הראל", "מנורה", "איילון", "כלל ביטוח", "ביטוח ישיר",
    "aig", "הכשרה", "שירביט", "9 מיליון", "ווישור", "מנורה מבטחים",
    "כלל חברה לביטוח", "ליברה",
  ],
  // ── Long-term savings / provident / mutual funds → pension ──
  pension: [
    "אלטשולר שחם", "מיטב", "מור גמל", "ילין לפידות", "פסגות", "אנליסט",
    "הראל פנסיה", "הראל גמל", "כלל פנסיה", "מגדל מקפת", "מור גמל",
    "אינפיניטי", "הראל פיננסים", "מיטב דש", "ישראל ברוקרס",
  ],
  // ── Housing / municipal → housing ──
  housing: [
    "ארנונה", "עיריית", "מי העיר", "ועד בית", "מועצה מקומית", "שכר דירה",
  ],
  // ── Education / kids → education ──
  education: [
    "צהרון", "גן ילדים", "מתנ\"ס", "בית ספר", "אוניברסיטת", "מכללת",
    "האוניברסיטה הפתוחה", "קמפוס", "חוג", "ספרי לימוד",
  ],
  // ── Leisure / culture / sport → leisure ──
  leisure: [
    "הולמס פלייס", "holmes place", "גו אקטיב", "go active", "אנרג'ים",
    "סינמה סיטי", "יס פלאנט", "רב חן", "לב סינמה", "הבימה", "קמרי",
    "סופרלנד", "לונה פארק", "מיני ישראל", "ספארי", "גן החיות", "אסקייפ",
    "פלאפיט", "icebar", "באולינג", "פיטנס",
  ],
};

function clean(s) {
  return s.replace(/["‏‎]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}
function sqlQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

const rows = [];
const seen = new Set();
for (const [category, names] of Object.entries(M)) {
  for (const name of names) {
    const key = clean(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push({ key, category, sample: name.trim() });
  }
}

// Build SQL: delete prior tagged batch, then insert each row only if the
// merchant has no existing winning rule.
const lines = [];
lines.push("begin;");
lines.push(`delete from public.merchant_category_votes where source_file = ${sqlQuote(SEED_TAG)};`);
for (const r of rows) {
  lines.push(
    `insert into public.merchant_category_votes ` +
      `(created_by, merchant_key, category_key, tx_count, sample_description, source_file) ` +
      `select ${sqlQuote(CREATED_BY)}::uuid, ${sqlQuote(r.key)}, ${sqlQuote(r.category)}, ${TX_COUNT}, ` +
      `${sqlQuote(r.sample)}, ${sqlQuote(SEED_TAG)} ` +
      `where not exists (select 1 from public.v_merchant_category_rules v where v.merchant_key = ${sqlQuote(r.key)});`
  );
}
lines.push("commit;");
const sql = lines.join("\n");

console.error(`Prepared ${rows.length} merchant rows across ${Object.keys(M).length} categories.`);

if (!process.argv.includes("--apply")) {
  console.log(sql);
  console.error("\nDRY RUN — re-run with --apply to execute.");
  process.exit(0);
}

// ── Apply via psql using .env.supabase credentials ──
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const env = Object.fromEntries(
  readFileSync(path.join(root, ".env.supabase"), "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    })
);
const pw = encodeURIComponent(env.SUPABASE_DB_PASSWORD);
const conn = `postgresql://postgres:${pw}@db.${env.SUPABASE_PROJECT_ID}.supabase.co:5432/postgres?sslmode=require`;

const out = execFileSync("psql", [conn, "-v", "ON_ERROR_STOP=1", "-f", "-"], {
  input: sql,
  encoding: "utf8",
});
console.error(out);
console.error("✅ Seed applied.");
