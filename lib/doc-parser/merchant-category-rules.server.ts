import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeMerchantCategoryRulesFromVotes,
  type MerchantCategoryVoteRecord,
} from "./merchant-category-rules-core";
import { setMerchantCategoryRulesCache, type MerchantCategoryRule } from "./merchant-category-rules";

interface MerchantCategoryRuleDbRow {
  merchant_key: string;
  category_key: string;
  count: number;
  first_seen_at: string;
  updated_at: string;
  sample_description: string | null;
}

interface MerchantCategoryVoteDbRow {
  merchant_key: string;
  category_key: string;
  tx_count: number;
  created_at: string;
  sample_description: string | null;
}

function mapRuleRow(row: MerchantCategoryRuleDbRow): MerchantCategoryRule {
  return {
    merchantKey: row.merchant_key,
    categoryKey: row.category_key,
    count: Number(row.count) || 0,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
    sampleDescription: row.sample_description || undefined,
  };
}

function mapVoteRow(row: MerchantCategoryVoteDbRow): MerchantCategoryVoteRecord {
  return {
    merchantKey: row.merchant_key,
    categoryKey: row.category_key,
    txCount: Number(row.tx_count) || 0,
    createdAt: row.created_at,
    sampleDescription: row.sample_description || undefined,
  };
}

export async function loadMerchantCategoryRulesFromDb(
  sb: SupabaseClient
): Promise<MerchantCategoryRule[]> {
  try {
    const { data, error } = await sb
      .from("v_merchant_category_rules")
      .select("merchant_key, category_key, count, first_seen_at, updated_at, sample_description")
      .order("merchant_key", { ascending: true });
    if (!error && Array.isArray(data)) {
      return (data as MerchantCategoryRuleDbRow[]).map(mapRuleRow);
    }
  } catch (error) {
    console.warn("[merchant-category-rules] view load failed, falling back to raw votes:", error);
  }

  const { data, error } = await sb
    .from("merchant_category_votes")
    .select("merchant_key, category_key, tx_count, created_at, sample_description")
    .order("created_at", { ascending: true });

  if (error || !Array.isArray(data)) {
    if (error) {
      console.warn("[merchant-category-rules] raw vote load failed:", error.message);
    }
    return [];
  }

  return computeMerchantCategoryRulesFromVotes(
    (data as MerchantCategoryVoteDbRow[]).map(mapVoteRow)
  ).map((row) => ({
    merchantKey: row.merchantKey,
    categoryKey: row.categoryKey,
    count: row.count,
    firstSeenAt: row.firstSeenAt,
    updatedAt: row.updatedAt,
    sampleDescription: row.sampleDescription,
  }));
}

export async function primeMerchantCategoryRulesCacheFromDb(
  sb: SupabaseClient
): Promise<MerchantCategoryRule[]> {
  const rules = await loadMerchantCategoryRulesFromDb(sb);
  setMerchantCategoryRulesCache(rules);
  return rules;
}

export async function insertMerchantCategoryVotes(
  sb: SupabaseClient,
  userId: string,
  votes: Array<{
    merchantKey: string;
    categoryKey: string;
    txCount: number;
    sampleDescription?: string;
    sourceFile?: string;
  }>
): Promise<{ inserted: number }> {
  const rows = votes
    .map((vote) => ({
      created_by: userId,
      merchant_key: vote.merchantKey,
      category_key: vote.categoryKey,
      tx_count: Math.max(1, Math.floor(Number(vote.txCount) || 1)),
      sample_description: vote.sampleDescription || null,
      source_file: vote.sourceFile || null,
    }))
    .filter((row) => row.merchant_key && row.category_key);

  if (rows.length === 0) {
    return { inserted: 0 };
  }

  const { error } = await sb.from("merchant_category_votes").insert(rows);
  if (error) {
    throw new Error(error.message);
  }

  return { inserted: rows.length };
}
