/**
 * Icon + brand color per bank / credit-card issuer for the upload UI.
 * Falls back to "לא זוהה" when the parser can't identify the source.
 */

export interface BankIcon {
  icon: string;
  color: string;
}

export const BANK_ICONS: Record<string, BankIcon> = {
  "בנק הפועלים": { icon: "account_balance", color: "#c41230" },
  "בנק לאומי": { icon: "account_balance", color: "#009639" },
  "בנק דיסקונט": { icon: "account_balance", color: "#003399" },
  "מזרחי-טפחות": { icon: "account_balance", color: "#8b0000" },
  הבינלאומי: { icon: "account_balance", color: "#004d99" },
  ישראכרט: { icon: "credit_card", color: "#1a237e" },
  כאל: { icon: "credit_card", color: "#e65100" },
  מקס: { icon: "credit_card", color: "#0d47a1" },
  "ויזה כאל": { icon: "credit_card", color: "#1a237e" },
  "אמריקן אקספרס": { icon: "credit_card", color: "#006fcf" },
  "לא זוהה": { icon: "help_outline", color: "#6b7280" },
};

export function getBankIcon(hint: string): BankIcon {
  return BANK_ICONS[hint] || BANK_ICONS["לא זוהה"];
}
