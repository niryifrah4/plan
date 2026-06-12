// @ts-check
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Flat config ממוקד — שומר הסף, לא לינטר סגנון מלא.
 *
 * המטרה היחידה כרגע: לחסום `catch {}` ריקים (ראו שלב 3 בתוכנית היציבות).
 * כל שגיאה שנבלעת בשקט היא באג שלא יגיע ל-Sentry. הכלל no-empty עם
 * allowEmptyCatch:false מכריח כל catch לעשות משהו (לרוב reportError()).
 *
 * בכוונה לא מרחיבים את recommended המלא — אנחנו לא רוצים להפיל את ה-CI על
 * מאות אזהרות סגנון קיימות. אפשר להחמיר בהדרגה בעתיד.
 */
export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "playwright-report/**",
      "test-results/**",
      "_parked/**",
      "scripts/**",
      "*.config.{js,mjs,ts}",
      "next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    // ה-plugin רשום כדי שהפניות `@typescript-eslint/*` בתוך eslint-disable
    // comments קיימים יוכרו (אחרת ESLint זורק "rule was not found"). הכללים
    // לא מופעלים — אנחנו עדיין לינטר ממוקד, לא recommended מלא.
    plugins: { "@typescript-eslint": tseslint.plugin, "react-hooks": reactHooks },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    // מכבים דיווח על eslint-disable מיותרים — יש בקוד עשרות disable comments
    // ישנים לכללים שלא מופעלים כאן; הם לא שגיאה אמיתית.
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  }
);
