import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/supabase/require-user";
import {
  insertMerchantCategoryVotes,
  loadMerchantCategoryRulesFromDb,
  primeMerchantCategoryRulesCacheFromDb,
} from "@/lib/doc-parser/merchant-category-rules.server";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

const MAX_BULK_VOTES = 1000;

type VoteInput = {
  merchantKey?: unknown;
  categoryKey?: unknown;
  txCount?: unknown;
  sampleDescription?: unknown;
  sourceFile?: unknown;
};

function cleanText(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/["\u200F\u200E]/g, "").replace(/\s+/g, " ").trim().toLowerCase()
    : "";
}

function normalizeVote(input: VoteInput): {
  merchantKey: string;
  categoryKey: string;
  txCount: number;
  sampleDescription?: string;
  sourceFile?: string;
} | null {
  const merchantKey = cleanText(input?.merchantKey);
  const categoryKey = cleanText(input?.categoryKey);
  const txCount = Math.max(1, Math.floor(Number(input?.txCount) || 1));
  const sampleDescription =
    typeof input?.sampleDescription === "string" ? input.sampleDescription.trim() : undefined;
  const sourceFile = typeof input?.sourceFile === "string" ? input.sourceFile.trim() : undefined;
  if (!merchantKey || !categoryKey) return null;
  return { merchantKey, categoryKey, txCount, sampleDescription, sourceFile };
}

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const rules = await loadMerchantCategoryRulesFromDb(auth.sb);
  return NextResponse.json({ rules });
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  let body: { vote?: VoteInput; votes?: VoteInput[] } | null = null;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const votes = Array.isArray(body?.votes)
    ? body!.votes.map(normalizeVote).filter(Boolean)
    : body?.vote
      ? [normalizeVote(body.vote)].filter(Boolean)
      : [];

  if (votes.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  if (votes.length > MAX_BULK_VOTES) {
    return NextResponse.json(
      { ok: false, error: "too_many_votes" },
      { status: 413 }
    );
  }

  try {
    const { inserted } = await insertMerchantCategoryVotes(auth.sb, auth.user.id, votes as any);
    const rules = await primeMerchantCategoryRulesCacheFromDb(auth.sb);
    return NextResponse.json({ ok: true, inserted, rules });
  } catch (error) {
    console.error("[merchant-category-rules] write failed:", error);
    return NextResponse.json(
      { ok: false, error: "write_failed" },
      { status: 500 }
    );
  }
}
