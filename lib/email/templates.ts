/**
 * Email templates — Hebrew, plain-text first, HTML lightweight.
 *
 * Keep template logic in pure functions so any caller (server action, API
 * route, Supabase trigger) can compose the same message without coupling
 * to Resend.
 */

interface InviteParams {
  clientName?: string;
  advisorName: string;
  inviteUrl: string;
}

export function inviteEmail(p: InviteParams): { subject: string; text: string; html: string } {
  const greeting = p.clientName ? `שלום ${p.clientName},` : "שלום,";
  const subject = `${p.advisorName} מזמין/ה אותך ל-Plan — מערכת התכנון הפיננסי`;
  const text = [
    greeting,
    "",
    `${p.advisorName} פתח/ה עבורך חשבון אישי במערכת Plan — כלי תכנון פיננסי שיעזור לך לראות את התמונה הכוללת של המשפחה: תזרים, מטרות, פנסיה, השקעות ונדל"ן.`,
    "",
    "כדי להפעיל את החשבון, היכנס/י דרך הקישור הבא:",
    p.inviteUrl,
    "",
    "הקישור תקף ל-7 ימים. אם הוא פג תוקף — פנה/י ליועץ/ת לקבלת קישור חדש.",
    "",
    "שאלות? פשוט השב/י למייל הזה ונחזור אליך.",
    "",
    "בהצלחה,",
    "צוות Plan",
  ].join("\n");

  const html =
    `<div dir="rtl" style="font-family: 'Assistant', system-ui, -apple-system, sans-serif; color:#012D1D; max-width:560px; margin:0 auto; padding:24px;">
  <p style="font-size:16px;">${greeting}</p>
  <p style="font-size:15px; line-height:1.7;">
    <strong>${p.advisorName}</strong> פתח/ה עבורך חשבון אישי במערכת <strong>Plan</strong> —
    כלי תכנון פיננסי שיעזור לך לראות את התמונה הכוללת של המשפחה: תזרים, מטרות,
    פנסיה, השקעות ונדל"ן.
  </p>
  <p style="font-size:15px; line-height:1.7;">כדי להפעיל את החשבון, לחץ/י על הכפתור:</p>
  <p style="text-align:center; margin:32px 0;">
    <a href="${p.inviteUrl}"
       style="display:inline-block; background:#1B4332; color:#F9FAF2; padding:14px 28px; border-radius:12px; text-decoration:none; font-weight:800; font-size:15px;">
      פתיחת החשבון
    </a>
  </p>
  <p style="font-size:13px; color:#5a7a6a;">
    הקישור תקף ל-7 ימים. אם הוא פג תוקף, פנה/י ליועץ/ת לקבלת קישור חדש.
  </p>
  <hr style="border:0; border-top:1px solid #eef2e8; margin:24px 0;" />
  <p style="font-size:12px; color:#5a7a6a;">
    שאלות? פשוט השב/י למייל הזה.
    <br />צוות Plan
  </p>
</div>`.trim();

  return { subject, text, html };
}
