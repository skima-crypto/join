// src/services/mining.ts
import { supabase } from "../../lib/supabase";
import { v4 as uuidv4 } from "uuid";
import {
  BASE_RATE_PER_HOUR,
  BOOST_DURATION_MINUTES,
  BOOST_MULTIPLIER,
  MAX_BOOSTS_PER_24H,
  MAX_DAILY_REWARDS_PER_24H,
  DAILY_REWARD_AMOUNT,
  SESSION_DURATION_HOURS,
  userCountFactor,
  earnedForMinutes,
  roundVAD,
  boostExpiryFrom
} from "./mining.utils";

import type { MiningSession, VADTransaction } from "../types";

/** Helpers */

async function getActiveSession(userId: string): Promise<MiningSession | null> {
  const { data, error } = await supabase
    .from("mining_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as any) ?? null;
}

async function getBoostRecordsSince(userId: string, sinceISO: string) {
  const { data, error } = await supabase
    .from("vad_transactions")
    .select("id, created_at, description")
    .eq("user_id", userId)
    .eq("transaction_type", "boost")
    .gte("created_at", sinceISO);

  if (error) throw error;
  return (data as any) ?? [];
}

async function countAdInteractions(userId: string, ad_type: string, sinceISO: string) {
  const { count, error } = await supabase
    .from("ad_interactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("ad_type", ad_type)
    .eq("completed", true)
    .gte("created_at", sinceISO);

  if (error) throw error;
  return count ?? 0;
}

async function getActiveUsersCountLast24h(): Promise<number> {
  const sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data, error } = await supabase
    .from("mining_sessions")
    .select("user_id")
    .gte("start_time", sinceISO)
    .neq("user_id", null);

  if (error) {
    console.warn("active users count fallback error, returning 1", error);
    return 1;
  }
  const set = new Set((data ?? []).map((r: any) => r.user_id));
  return set.size || 1;
}

/** --- Public API --- */

export async function startMining(userId: string) {
  if (!userId) throw new Error("userId required");

  // ensure no active session
  const active = await getActiveSession(userId);
  if (active) {
    // check expiry
    const start = active.start_time ? new Date(active.start_time).getTime() : 0;
    if (Date.now() - start < SESSION_DURATION_HOURS * 3600 * 1000) {
      return { started: false, reason: "active_session" };
    } else {
      // session expired but still is_active true — mark inactive
      await supabase
        .from("mining_sessions")
        .update({ is_active: false, end_time: new Date().toISOString() })
        .eq("id", active.id);
    }
  }

  // create a new mining_session
  const startTime = new Date().toISOString();
  const activeCount = await getActiveUsersCountLast24h();
  const uFactor = userCountFactor(activeCount);
  const initialRate = BASE_RATE_PER_HOUR * uFactor;

  const payload = {
    id: uuidv4(),
    user_id: userId,
    mining_rate: initialRate,
    boosted_rate: 0,
    start_time: startTime,
    end_time: null,
    is_active: true,
    total_earned: 0,
  };

  const { data, error } = await supabase.from("mining_sessions").insert(payload).select().single();
  if (error) throw error;

  // ensure daily_status exists
  await supabase.from("daily_status").upsert({ user_id: userId }, { onConflict: "user_id" });

  return { started: true, session: data };
}

export async function stopMining(userId: string) {
  const session = await getActiveSession(userId);
  if (!session) return { stopped: false, reason: "no_active_session" };
  const { error } = await supabase
    .from("mining_sessions")
    .update({ is_active: false, end_time: new Date().toISOString() })
    .eq("id", session.id);
  if (error) throw error;
  return { stopped: true };
}

/**
 * calculateReward - returns accumulated VAD for active session (not yet credited)
 */
export async function calculateReward(userId: string) {
  const session = await getActiveSession(userId);
  if (!session || !session.start_time) return { accumulated: 0, breakdown: null };

  const start = new Date(session.start_time);
  const now = new Date();
  const msSince = Math.min(now.getTime() - start.getTime(), SESSION_DURATION_HOURS * 3600 * 1000);
  const minutesSince = Math.floor(msSince / (60 * 1000));
  if (minutesSince <= 0) return { accumulated: 0, breakdown: null };

  // compute boosted minutes from boost transactions (stored in vad_transactions)
  const boostSinceISO = session.start_time;
  const boosts = await getBoostRecordsSince(userId, boostSinceISO);
  let boostedMinutes = 0;
  for (const b of boosts) {
    const bStart = new Date((b as any).created_at);
    const bEnd = new Date(bStart.getTime() + BOOST_DURATION_MINUTES * 60 * 1000);
    const effStart = bStart < start ? start : bStart;
    const effEnd = bEnd > now ? now : bEnd;
    if (effEnd > effStart) {
      const mins = Math.floor((effEnd.getTime() - effStart.getTime()) / (60 * 1000));
      boostedMinutes += mins;
    }
  }

  const normalMinutes = Math.max(0, minutesSince - boostedMinutes);

  // recompute current user count factor (may change during session)
  const activeUsers = await getActiveUsersCountLast24h();
  const uFactor = userCountFactor(activeUsers);

  // Use session.mining_rate as baseline per hour (already multiplied by uFactor at start)
  const baseHourRate = Number(session.mining_rate ?? BASE_RATE_PER_HOUR);

  const normalEarned = earnedForMinutes(normalMinutes, baseHourRate, 1, 1 /* mining_rate already includes uFactor */);
  const boostedEarned = earnedForMinutes(boostedMinutes, baseHourRate, BOOST_MULTIPLIER, 1);

  const total = roundVAD(normalEarned + boostedEarned);

  return {
    accumulated: total,
    breakdown: {
      minutesSince,
      normalMinutes,
      boostedMinutes,
      baseHourRate,
      activeUsers,
      sessionId: session.id,
      sessionStart: session.start_time,
    },
  };
}

/**
 * claimMiningRewards - credits the accumulated VAD, marks the session total_earned, and inserts a vad_transactions row
 * Idempotency: checks any 'session_credit' tx for this session before inserting
 */
export async function claimMiningRewards(userId: string) {
  const session = await getActiveSession(userId);
  if (!session || !session.start_time) return { credited: 0, reason: "no_active_session" };

  const creditDesc = `session_credit:${session.id}`;
  const { data: existing, error: exErr } = await supabase
    .from("vad_transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("description", creditDesc);

  if (exErr) throw exErr;
  if (existing && (existing as any).length > 0) {
    const sum = (existing as any).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    return { credited: roundVAD(sum), already: true };
  }

  const calc = await calculateReward(userId);
  const amount = Number(calc.accumulated ?? 0);
  if (!amount || amount <= 0) return { credited: 0, reason: "nothing_to_claim" };

  const txPayload = {
    id: uuidv4(),
    user_id: userId,
    amount: roundVAD(amount),
    transaction_type: "mine",
    description: creditDesc,
  };

  const { data: txData, error: txErr } = await supabase.from("vad_transactions").insert(txPayload).select().single();
  if (txErr) throw txErr;

  const newTotal = (Number(session.total_earned ?? 0) + amount);
  const { error: msErr } = await supabase
    .from("mining_sessions")
    .update({ total_earned: newTotal, /* optionally end session */ })
    .eq("id", session.id);

  if (msErr) console.warn("failed to update mining_sessions total_earned", msErr);

  return { credited: roundVAD(amount), tx: txData };
}

/**
 * applyBoost - record a boost start (user watched boost ad)
 */
export async function applyBoost(userId: string) {
  const sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const boostsUsed = await countAdInteractions(userId, "daily_boost", sinceISO);
  if (boostsUsed >= MAX_BOOSTS_PER_24H) {
    return { applied: false, reason: "boost_limit" };
  }

  const nowISO = new Date().toISOString();
  // log ad_interaction for boost completion (frontend should also log)
  const adPayload = {
    id: uuidv4(),
    user_id: userId,
    ad_type: "daily_boost",
    completed: true,
    reward: 0,
  };
  const { error: adErr } = await supabase.from("ad_interactions").insert(adPayload);
  if (adErr) console.warn("ad_interactions insert error (boost):", adErr);

  // create boost transaction (acts as boost event start)
  const boostTx = {
    id: uuidv4(),
    user_id: userId,
    amount: 0,
    transaction_type: "boost",
    description: "boost_start",
    created_at: nowISO,
  };

  const { data, error } = await supabase.from("vad_transactions").insert(boostTx).select().single();
  if (error) throw error;

  // update daily_status.last_boost_at
  const { error: dsErr } = await supabase
    .from("daily_status")
    .upsert({ user_id: userId, last_boost_at: nowISO }, { onConflict: "user_id" });

  if (dsErr) console.warn("daily_status upsert error", dsErr);

  return { applied: true, boostTx: data };
}

/**
 * claimDailyReward - limited per day, must call after ad completed
 */
export async function claimDailyReward(userId: string) {
  const sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const used = await countAdInteractions(userId, "daily_reward", sinceISO);
  if (used >= MAX_DAILY_REWARDS_PER_24H) {
    return { claimed: false, reason: "daily_reward_limit" };
  }

  // log ad_interaction
  const adPayload = {
    id: uuidv4(),
    user_id: userId,
    ad_type: "daily_reward",
    completed: true,
    reward: DAILY_REWARD_AMOUNT,
  };
  const { error: adErr } = await supabase.from("ad_interactions").insert(adPayload);
  if (adErr) console.warn("ad_interactions insert error (daily_reward):", adErr);

  // credit transaction
  const txPayload = {
    id: uuidv4(),
    user_id: userId,
    amount: roundVAD(Number(DAILY_REWARD_AMOUNT)),
    transaction_type: "daily_reward",
    description: "daily_reward_claim",
  };

  const { data: txData, error: txErr } = await supabase.from("vad_transactions").insert(txPayload).select().single();
  if (txErr) throw txErr;

  // update daily_status
  const { error: dsErr } = await supabase
    .from("daily_status")
    .upsert({ user_id: userId, last_daily_reward_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (dsErr) console.warn("daily_status upsert error", dsErr);

  return { claimed: true, tx: txData };
}

/**
 * getMiningState - returns session, accumulated, boosts/daily info
 */
export async function getMiningState(userId: string) {
  const session = await getActiveSession(userId);
  const calc = await calculateReward(userId);

  const sinceISO = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const boostsToday = await countAdInteractions(userId, "daily_boost", sinceISO);
  const dailyRewardsToday = await countAdInteractions(userId, "daily_reward", sinceISO);

  return {
    session: session ?? null,
    accumulated: calc.accumulated,
    breakdown: calc.breakdown,
    boosts: { usedToday: boostsToday, allowedPerDay: MAX_BOOSTS_PER_24H },
    dailyReward: { usedToday: dailyRewardsToday, allowedPerDay: MAX_DAILY_REWARDS_PER_24H, rewardAmount: DAILY_REWARD_AMOUNT },
  };
}
