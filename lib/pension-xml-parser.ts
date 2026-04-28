/**
 * ═══════════════════════════════════════════════════════════
 *  מסלקה פנסיונית — XML Parser
 * ═══════════════════════════════════════════════════════════
 *
 * Parses the structured XML files downloaded from the Israeli
 * pension clearinghouse (מסלקה פנסיונית).
 *
 * File types by code in the filename:
 *   PNN = Pension (קרן פנסיה)
 *   KGM = Kupat Gemel / Hishtalmut (קופת גמל / קרן השתלמות)
 *   ING = Insurance (ביטוח מנהלים / ביטוח חיים)
 *
 * SUG-MUTZAR mapping:
 *   1 = קרן פנסיה ותיקה
 *   2 = קרן פנסיה חדשה
 *   3 = ביטוח מנהלים
 *   4 = קופת גמל
 *   5 = קרן השתלמות
 *   6 = ביטוח חיים (ריסק)
 *   7 = ביטוח מנהלים (חדש)
 *
 * Runs entirely client-side — XML is small structured text.
 */

import type { PensionFund } from "./pension-store";

/* ── Parsed intermediate type ── */

export interface ParsedMislakaProduct {
  company: string;           // SHEM-YATZRAN
  productType: number;       // SUG-MUTZAR
  employer?: string;         // SHEM-MAASIK (active employer)
  balance: number;           // TOTAL-CHISACHON-MITZTABER-TZAFUY or sum of tracks
  tracks: {
    name: string;            // SHEM-MASLUL-HASHKAA
    balance: number;         // TOTAL-CHISACHON-MTZBR
    returnPct?: number;      // TSUA-NETO
  }[];
  mgmtFeeDeposit: number;   // MEMOTZA-SHEUR-DMEI-NIHUL-HAFKADA
  mgmtFeeBalance: number;   // SHEUR-DMEI-NIHUL-TZVIRA (avg)
  monthlyContrib: number;    // Derived from annual contributions / 12
  insuranceCover?: {
    death: boolean;
    disability: boolean;
    lossOfWork: boolean;
  };
  returnPct?: number;        // SHEUR-TSUA-NETO
  openingDate?: string;      // TAARICH-HATZTRFUT or TAARICH-PTICHA (YYYY-MM-DD)
}

export interface ParsedMislakaBundle {
  files: string[];
  products: ParsedMislakaProduct[];
  ownerName?: string;
  warnings: string[];
}

/* ── Helpers ── */

function txt(el: Element, tag: string): string {
  const child = el.getElementsByTagName(tag)[0];
  if (!child) return "";
  const val = child.textContent?.trim() ?? "";
  // Check for xsi:nil="true"
  if (child.getAttribute("xsi:nil") === "true" || child.getAttributeNS("http://www.w3.org/2001/XMLSchema-instance", "nil") === "true") return "";
  return val;
}

function num(el: Element, tag: string): number {
  const v = txt(el, tag);
  return v ? parseFloat(v) || 0 : 0;
}

function mapProductType(sugMutzar: number): PensionFund["type"] {
  switch (sugMutzar) {
    case 1: return "pension";   // ותיקה
    case 2: return "pension";   // חדשה
    case 3: return "bituach";   // ביטוח מנהלים
    case 4: return "gemel";     // קופת גמל
    case 5: return "hishtalmut";
    case 6: return "bituach";   // ביטוח חיים
    case 7: return "bituach";   // ביטוח מנהלים חדש
    default: return "gemel";
  }
}

function mapSubtype(sugMutzar: number): PensionFund["subtype"] {
  switch (sugMutzar) {
    case 1: return "pension_vatika";
    case 2: return "pension_hadasha";
    case 3: return "bituach_classic";
    case 7: return "bituach_2004";
    default: return undefined;
  }
}

function productLabel(sugMutzar: number): string {
  switch (sugMutzar) {
    case 1: return "קרן פנסיה ותיקה";
    case 2: return "קרן פנסיה";
    case 3: return "ביטוח מנהלים";
    case 4: return "קופת גמל";
    case 5: return "קרן השתלמות";
    case 6: return "ביטוח חיים";
    case 7: return "ביטוח מנהלים";
    default: return "מוצר פנסיוני";
  }
}

/* ── Main parser ── */

export function parseMislakaXml(xmlStr: string, fileName: string): { products: ParsedMislakaProduct[]; ownerName?: string; warnings: string[] } {
  const warnings: string[] = [];
  const products: ParsedMislakaProduct[] = [];
  let ownerName: string | undefined;

  // Handle BOM and whitespace
  const cleanXml = xmlStr.replace(/^\uFEFF/, "").trim();
  if (!cleanXml) {
    warnings.push(`${fileName}: קובץ ריק`);
    return { products, ownerName, warnings };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanXml, "text/xml");

  // Check for parse error
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    warnings.push(`שגיאה בקריאת ${fileName}: ${parseError.textContent?.slice(0, 100)}`);
    return { products, ownerName, warnings };
  }

  // Company name — try multiple possible tag names
  let company = txt(doc.documentElement, "SHEM-YATZRAN");
  if (!company) company = txt(doc.documentElement, "ShemYatzran");
  if (!company) company = txt(doc.documentElement, "shem-yatzran");
  if (!company) {
    // Try to find any element containing "yatzran" (case-insensitive)
    const allEls = doc.getElementsByTagName("*");
    for (let i = 0; i < allEls.length; i++) {
      if (allEls[i].tagName.toLowerCase().includes("yatzran")) {
        company = allEls[i].textContent?.trim() || "";
        if (company) break;
      }
    }
  }
  if (!company) {
    warnings.push(`${fileName}: לא נמצא שם יצרן (SHEM-YATZRAN)`);
    return { products, ownerName, warnings };
  }

  // Product type
  const sugMutzar = num(doc.documentElement, "SUG-MUTZAR");

  // Owner name — try YeshutLakoach first (most reliable), then PirteiOved/PirteiMevutach
  const lakoach = doc.getElementsByTagName("YeshutLakoach")[0];
  const oved = lakoach || doc.getElementsByTagName("PirteiOved")[0] || doc.getElementsByTagName("PirteiMevutach")[0];
  if (oved) {
    const firstName = txt(oved, "SHEM-PRATI");
    const lastName = txt(oved, "SHEM-MISHPACHA");
    if (firstName || lastName) ownerName = `${firstName} ${lastName}`.trim();
  }

  // Overall balance — IMPORTANT: TOTAL-CHISACHON-MITZTABER-TZAFUY is the PROJECTED
  // balance at retirement age, NOT the current balance. We must NOT use it as the balance.
  // Instead, we prefer summing the actual track balances (SCHUM-TZVIRA-BAMASLUL).
  // Store the projected amount separately for pension simulation.
  const projectedBalance = num(doc.documentElement, "TOTAL-CHISACHON-MITZTABER-TZAFUY");
  let overallBalance = 0; // Will be filled from tracks or other tags

  // Tracks — tag is PerutMasluleiHashkaa (not MaslulHashkaa)
  // NOTE: same track name can appear under different employers with different balances.
  // Each occurrence is a separate allocation and should be counted (not deduped).
  const tracks: ParsedMislakaProduct["tracks"] = [];
  const maslulim = doc.getElementsByTagName("PerutMasluleiHashkaa");
  for (let i = 0; i < maslulim.length; i++) {
    const m = maslulim[i];
    const name = txt(m, "SHEM-MASLUL-HASHKAA");
    if (!name) continue;
    // Balance — try SCHUM-TZVIRA-BAMASLUL first (per-track balance), then TOTAL-CHISACHON-MTZBR
    let trackBalance = num(m, "SCHUM-TZVIRA-BAMASLUL");
    if (trackBalance <= 0) {
      const chisachon = m.getElementsByTagName("TOTAL-CHISACHON-MTZBR");
      for (let j = 0; j < chisachon.length; j++) {
        trackBalance += parseFloat(chisachon[j].textContent || "0") || 0;
      }
    }
    const ret = num(m, "TSUA-NETO");
    tracks.push({ name, balance: trackBalance, returnPct: ret || undefined });
  }

  // Primary: sum all track balances (most accurate current balance)
  if (tracks.length > 0) {
    overallBalance = tracks.reduce((s, t) => s + t.balance, 0);
  }
  // Fallback: if no tracks found, use projected balance as rough estimate
  if (overallBalance <= 0 && projectedBalance > 0) {
    // Only use projected if it's small (< ₪100K) — large values are clearly projections
    // For large projected values without tracks, we can't determine current balance
    if (projectedBalance < 100000) {
      overallBalance = projectedBalance;
    } else {
      warnings.push(`${fileName}: ${company} — צבירה צפויה ${Math.round(projectedBalance).toLocaleString()}₪ (ייתכן שזה צפי לפרישה, לא יתרה נוכחית)`);
    }
  }

  // Management fees — look for averaged fee
  let mgmtFeeDeposit = 0;
  let mgmtFeeBalance = 0;
  const dmeiNihul = doc.getElementsByTagName("DmeiNihul");
  for (let i = 0; i < dmeiNihul.length; i++) {
    const dn = dmeiNihul[i];
    const avgHafkada = num(dn, "MEMOTZA-SHEUR-DMEI-NIHUL-HAFKADA");
    const tzvira = num(dn, "SHEUR-DMEI-NIHUL-TZVIRA");
    if (avgHafkada > mgmtFeeDeposit) mgmtFeeDeposit = avgHafkada;
    if (tzvira > mgmtFeeBalance) mgmtFeeBalance = tzvira;
  }
  // Fallback: look at direct children
  if (mgmtFeeDeposit === 0) mgmtFeeDeposit = num(doc.documentElement, "MEMOTZA-SHEUR-DMEI-NIHUL-HAFKADA");
  if (mgmtFeeBalance === 0) mgmtFeeBalance = num(doc.documentElement, "SHEUR-DMEI-NIHUL-TZVIRA");

  // Monthly contributions — sum annual then /12
  // Wrapper tag varies: HafkadotShnatiyot (pension), HafkadotNetuneiReisha (some formats)
  let annualContrib = 0;
  const hafkadotWrappers = ["HafkadotShnatiyot", "HafkadotNetuneiReisha"];
  for (const wrapper of hafkadotWrappers) {
    const hafkadotElements = doc.getElementsByTagName(wrapper);
    for (let i = 0; i < hafkadotElements.length; i++) {
      const h = hafkadotElements[i];
      annualContrib += num(h, "TOTAL-HAFKADOT-OVED-TAGMULIM-SHANA-NOCHECHIT");
      annualContrib += num(h, "TOTAL-HAFKADOT-MAAVID-TAGMULIM-SHANA-NOCHECHIT");
      annualContrib += num(h, "TOTAL-HAFKADOT-PITZUIM-SHANA-NOCHECHIT");
    }
  }
  const monthlyContrib = annualContrib > 0 ? Math.round(annualContrib / 12) : 0;

  // Insurance cover (for pension funds)
  const bituachSection = doc.getElementsByTagName("KisuyBituachi")[0];
  let insuranceCover: ParsedMislakaProduct["insuranceCover"];
  if (bituachSection || sugMutzar === 1 || sugMutzar === 2) {
    const maslulBituach = txt(doc.documentElement, "SHEM-MASLUL-HABITUAH");
    const hasDeath = maslulBituach.includes("שאירים") || maslulBituach.includes("פטירה");
    const hasDisability = maslulBituach.includes("נכות");
    const hasLossOfWork = maslulBituach.includes("אובדן");
    insuranceCover = { death: hasDeath, disability: hasDisability, lossOfWork: hasLossOfWork };
  }

  // Return
  const returnPct = num(doc.documentElement, "SHEUR-TSUA-NETO") || undefined;

  // Employer
  let employer: string | undefined;
  const maasikEls = doc.getElementsByTagName("YeshutMaasik");
  if (maasikEls.length > 0) {
    // Take the last employer (most recent)
    employer = txt(maasikEls[maasikEls.length - 1], "SHEM-MAASIK") || undefined;
  }

  // For ING files (insurance), also check ERECH-PIDYON-SOF-SHANA and YITRAT-SOF-SHANA
  if (overallBalance <= 0) {
    const pidyon = num(doc.documentElement, "ERECH-PIDYON-SOF-SHANA");
    const yitra = num(doc.documentElement, "YITRAT-SOF-SHANA");
    if (pidyon > 0) overallBalance = pidyon;
    else if (yitra > 0) overallBalance = yitra;
  }

  // Opening date — try multiple possible tags
  let openingDate: string | undefined;
  const dateTagCandidates = [
    "TAARICH-HATZTRFUT", "TAARICH-PTICHA", "TAARICH-TCHILAT-BITUACH",
    "TAARICH-TCHILAT-POLISA", "TAARICH-HAFKADA-RISHONA",
  ];
  for (const tag of dateTagCandidates) {
    const dateStr = txt(doc.documentElement, tag);
    if (dateStr) {
      // Parse various date formats: YYYY-MM-DD, DD/MM/YYYY, YYYYMMDD
      const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      const slashMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      const compactMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})$/);
      if (isoMatch) {
        openingDate = dateStr;
        break;
      } else if (slashMatch) {
        openingDate = `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`;
        break;
      } else if (compactMatch) {
        openingDate = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
        break;
      }
    }
  }

  // Skip products with 0 balance and no tracks (inactive/empty)
  // Exception: ביטוח חיים (6) and ביטוח מנהלים (3,7) may be pure risk without savings
  const isInsurancePolicy = sugMutzar === 3 || sugMutzar === 6 || sugMutzar === 7;
  if (overallBalance <= 0 && tracks.length === 0 && !isInsurancePolicy) {
    warnings.push(`${fileName}: ${company} — מוצר ללא יתרה, דילוג`);
    return { products, ownerName, warnings };
  }

  products.push({
    company: company.replace(/בע"?מ|בעמ/g, "").trim(),
    productType: sugMutzar,
    employer,
    balance: overallBalance,
    tracks,
    mgmtFeeDeposit,
    mgmtFeeBalance,
    monthlyContrib,
    insuranceCover,
    returnPct,
    openingDate,
  });

  return { products, ownerName, warnings };
}

/* ── Convert to PensionFund objects ── */

let _counter = 0;
function uid(): string {
  return `mislaka_${Date.now()}_${++_counter}`;
}

export function mislakaProductsToFunds(products: ParsedMislakaProduct[]): PensionFund[] {
  return products.map((p) => {
    const type = mapProductType(p.productType);
    const subtype = mapSubtype(p.productType);
    const trackName = p.tracks.length > 0
      ? p.tracks.map(t => t.name).join(", ")
      : productLabel(p.productType);

    // 2026-04-28: try to auto-link to fund-registry so the new risk + geo
    // pies on /pension light up immediately. Mislaka XML gives only free-
    // text track names, so we fuzzy-match against the registry.
    let registeredFundId: string | undefined;
    let matchedTracks: Array<{ name: string; balance: number; registeredFundId?: string; returnPct?: number }> | undefined;
    try {
      // Inline import avoids circular-dep risk at module load time.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { matchFundByTrack } = require("./track-matcher");

      // Match each track individually so multi-track funds (e.g. 60% מנייתי
      // + 40% אג"ח) get the correct weighted allocation.
      if (p.tracks.length > 0) {
        matchedTracks = p.tracks.map(t => {
          const m = matchFundByTrack(t.name, p.company, type);
          return {
            name: t.name,
            balance: Math.round(t.balance),
            returnPct: t.returnPct,
            registeredFundId: m.fundId || undefined,
          };
        });
        // Top-level registeredFundId reflects the LARGEST track (back-compat).
        const dominant = matchedTracks
          .slice()
          .sort((a, b) => b.balance - a.balance)[0];
        if (dominant?.registeredFundId) registeredFundId = dominant.registeredFundId;
      } else {
        const m = matchFundByTrack(trackName, p.company, type);
        if (m.fundId) registeredFundId = m.fundId;
      }
    } catch {
      // matcher unavailable — skip silently, user can pick manually
    }

    return {
      id: uid(),
      company: p.company,
      type,
      subtype,
      balance: Math.round(p.balance),
      mgmtFeeDeposit: p.mgmtFeeDeposit,
      mgmtFeeBalance: p.mgmtFeeBalance,
      track: trackName,
      monthlyContrib: p.monthlyContrib,
      insuranceCover: p.insuranceCover,
      openingDate: p.openingDate,
      registeredFundId,
      tracks: matchedTracks,
    };
  });
}

/* ── Parse multiple files ── */

export async function parseMislakaFiles(files: File[]): Promise<ParsedMislakaBundle> {
  const allProducts: ParsedMislakaProduct[] = [];
  const fileNames: string[] = [];
  const allWarnings: string[] = [];
  let ownerName: string | undefined;

  for (const file of files) {
    try {
      const text = await file.text();
      fileNames.push(file.name);
      console.log(`[pension-xml] parsing ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
      const result = parseMislakaXml(text, file.name);
      allProducts.push(...result.products);
      allWarnings.push(...result.warnings);
      if (result.ownerName && !ownerName) ownerName = result.ownerName;
      console.log(`[pension-xml] ${file.name}: ${result.products.length} products, ${result.warnings.length} warnings`);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      allWarnings.push(`שגיאה בקריאת ${file.name}: ${errMsg}`);
      console.error(`[pension-xml] error parsing ${file.name}:`, e);
    }
  }

  return {
    files: fileNames,
    products: allProducts,
    ownerName,
    warnings: allWarnings,
  };
}
