/**
 * /privacy — מדיניות פרטיות.
 *
 * 2026-04-30: גרסה ראשונית לקראת go-live. **חשוב**: זה תוכן ברירת מחדל
 * שמכסה את הבסיס של חוק הגנת הפרטיות הישראלי, אבל לפני קבלת לקוחות
 * משלמים מומלץ שעו"ד מתמחה בפרטיות יבדוק.
 *
 * Public page — אין auth gate.
 */

export default function PrivacyPage() {
  return (
    <main dir="rtl" className="min-h-screen bg-white" style={{ fontFamily: "'Assistant', sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-extrabold mb-2" style={{ color: "#012D1D" }}>
          מדיניות פרטיות
        </h1>
        <p className="text-sm text-verdant-muted mb-8">עודכן לאחרונה: 30 באפריל 2026</p>

        <Section title="1. מי אנחנו">
          <p>
            Plan ("המערכת") היא פלטפורמת תכנון פיננסי המשרתת יועצים פיננסיים
            ולקוחותיהם בישראל. השירות מופעל על ידי המפעיל ("אנחנו"). מסמך זה
            מתאר אילו נתונים אנו אוספים, כיצד הם מאוחסנים ומהן זכויותיך.
          </p>
        </Section>

        <Section title="2. איזה מידע אנחנו אוספים">
          <p>בעת השימוש במערכת אנו אוספים:</p>
          <ul className="list-disc pr-6 space-y-1 mt-2">
            <li>פרטי זיהוי בסיסיים: שם, כתובת אימייל, טלפון.</li>
            <li>נתונים פיננסיים שאתה מזין: הכנסות, הוצאות, נכסים, התחייבויות, יעדים.</li>
            <li>קבצים שאתה מעלה: דוחות בנק, אשראי, מסלקה פנסיונית, תלוש שכר.</li>
            <li>נתוני שימוש: זמני התחברות, פעולות באפליקציה, סוג מכשיר ודפדפן.</li>
          </ul>
          <p className="mt-3">
            אנחנו <strong>לא</strong> מבקשים סיסמאות בנק, מספרי כרטיסי אשראי
            או נתונים ביומטריים.
          </p>
        </Section>

        <Section title="3. איפה הנתונים מאוחסנים">
          <ul className="list-disc pr-6 space-y-1">
            <li>חלק מהנתונים נשמרים מקומית בדפדפן שלך (localStorage).</li>
            <li>חלקם מסונכרנים ל-Supabase (PostgreSQL מנוהל) באירופה (Frankfurt) עם הצפנה במנוחה.</li>
            <li>קבצים מועלים לאחסון מאובטח עם הרשאות RLS לפי משק בית.</li>
          </ul>
        </Section>

        <Section title="4. שימוש במידע">
          <p>הנתונים שלך משמשים אותנו אך ורק:</p>
          <ul className="list-disc pr-6 space-y-1 mt-2">
            <li>להציג לך תמונה פיננסית מאוחדת של המשפחה.</li>
            <li>לחשב תחזיות, סימולציות ותכנון ארוך טווח.</li>
            <li>לאפשר ליועץ הפיננסי שלך לעבוד איתך (אם הזמין אותך).</li>
            <li>לתקשר איתך בנוגע לחשבון, אבטחה ועדכונים מהותיים.</li>
          </ul>
          <p className="mt-3">
            <strong>איננו</strong> מוכרים, משכירים או משתפים את נתוניך עם
            מפרסמים או צדדים שלישיים שאינם נדרשים לתפעול השירות.
          </p>
        </Section>

        <Section title="5. שיתוף עם יועצים">
          <p>
            אם נכנסת באמצעות הזמנה מיועץ פיננסי, היועץ רואה את הנתונים שאתה
            מזין כחלק מתפקידו המקצועי. אתה יכול לבקש בכל עת לסיים את הקשר
            עם היועץ — נתוניך יישמרו בחשבונך אך יהפכו ללא נגישים ליועץ.
          </p>
        </Section>

        <Section title="6. עוגיות (Cookies)">
          <p>
            אנו משתמשים בעוגיות הכרחיות לזיהוי הסשן בלבד. אין עוגיות פרסום
            או מעקב צד שלישי.
          </p>
        </Section>

        <Section title="7. הזכויות שלך">
          <ul className="list-disc pr-6 space-y-1">
            <li><strong>עיון</strong> — ניתן לראות את כל הנתונים שלך בכל עת בתוך החשבון.</li>
            <li><strong>תיקון</strong> — ניתן לערוך או למחוק נתונים בתוך האפליקציה.</li>
            <li><strong>מחיקה</strong> — כפתור "איפוס מלא" בסרגל הצד מוחק את הנתונים מקומית ומ-Supabase. למחיקת חשבון כולל היסטוריה — כתוב לנו בכתובת שבסעיף 9.</li>
            <li><strong>ייצוא</strong> — ניתן לייצא לאקסל מתוך עמוד "תוכנית פעולה".</li>
          </ul>
        </Section>

        <Section title="8. אבטחה">
          <p>
            אנו מפעילים: TLS לכל תעבורה, RLS ברמת מסד הנתונים, סשן עם
            timeout של 15 דקות חוסר פעילות, content security policy מחמירה,
            וניטור שגיאות (Sentry) בלי לשמור תוכן רגיש. דיווחי פגיעה — לכתובת
            בסעיף 9.
          </p>
        </Section>

        <Section title="9. יצירת קשר">
          <p>
            לכל שאלה בנוגע למדיניות זו או לזכויותיך, ניתן לפנות בכתובת:
            <br />
            <a href="mailto:privacy@plan.local" className="text-verdant-emerald font-bold">
              privacy@plan.local
            </a>
          </p>
        </Section>

        <Section title="10. שינויים במדיניות">
          <p>
            ייתכן שנעדכן את המדיניות מעת לעת. שינויים מהותיים יישלחו אליך
            במייל לפחות 14 יום לפני כניסתם לתוקף.
          </p>
        </Section>

        <p className="text-xs text-verdant-muted mt-12">
          מסמך זה נכתב בהתאם לחוק הגנת הפרטיות, התשמ"א-1981 ולתקנות הגנת
          הפרטיות (אבטחת מידע), התשע"ז-2017.
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-lg font-extrabold mb-2" style={{ color: "#1B4332" }}>{title}</h2>
      <div className="text-sm leading-7" style={{ color: "#1B4332" }}>{children}</div>
    </section>
  );
}
