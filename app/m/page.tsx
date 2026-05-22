"use client";

/**
 * /m — mobile home (sanity-check version).
 *
 * Goal of THIS file: prove the route renders inside the existing auth +
 * middleware flow, fonts load, Morning palette is reachable. No real data
 * yet — that comes in the next step where we wire computeCurrentNetWorth(),
 * buildBudgetLines() and loadBuckets() into 3 large cards.
 */
export default function MobileHomePage() {
  return (
    <main style={{ padding: "20px 16px", color: "var(--morning-ink)" }} dir="rtl">
      <header style={{ marginBottom: 24 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--morning-muted)",
          }}
        >
          plan · mobile
        </div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            marginTop: 4,
            color: "var(--morning-ink)",
          }}
        >
          שלום מהמובייל 👋
        </h1>
        <p style={{ fontSize: 14, color: "var(--morning-muted)", marginTop: 4 }}>
          זה sanity-check. אם אתה רואה את הירוק והרקע הקרם — הראוט עובד.
        </p>
      </header>

      <div
        className="card"
        style={{
          padding: 20,
          borderRadius: 16,
          background: "var(--morning-surface)",
          border: "1px solid var(--morning-border)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--morning-forest)",
          }}
        >
          השלב הבא
        </div>
        <div style={{ fontSize: 16, marginTop: 8 }}>
          להחליף את הכרטיס הזה ב-3 כרטיסים אמיתיים:
        </div>
        <ul
          style={{
            marginTop: 12,
            paddingInlineStart: 18,
            fontSize: 14,
            color: "var(--morning-muted)",
            lineHeight: 1.8,
          }}
        >
          <li>תקציב החודש (כמה נותר)</li>
          <li>היעד הבא</li>
          <li>שווי נטו</li>
        </ul>
      </div>
    </main>
  );
}
