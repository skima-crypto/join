import { supabase } from "../supabase";

// ----------------------------
// Get Active Mining Session
// ----------------------------
export const getActiveMiningSession = async (userId: string) => {
  const { data, error } = await supabase
    .from("mining_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.log("Error fetching active mining session:", error);
    return null;
  }

  return data;
};

// ----------------------------
// Start Mining Session
// ----------------------------
export const startMining = async (userId: string) => {
  // End all existing sessions for safety
  await supabase
    .from("mining_sessions")
    .update({ is_active: false, end_time: new Date() })
    .eq("user_id", userId)
    .eq("is_active", true);

  // Start a new session
  const { data, error } = await supabase
    .from("mining_sessions")
    .insert({
      user_id: userId,
      mining_rate: 1,
      boosted_rate: 0,
      start_time: new Date(),
      is_active: true,
    })
    .select()
    .single();

  if (error) console.log("Error starting mining:", error);

  return data;
};

// ----------------------------
// Stop Mining Session
// ----------------------------
export const stopMining = async (sessionId: string) => {
  const { data, error } = await supabase
    .from("mining_sessions")
    .update({
      is_active: false,
      end_time: new Date(),
    })
    .eq("id", sessionId)
    .select()
    .single();

  if (error) console.log("Error stopping mining:", error);

  return data;
};

// ----------------------------
// Apply Boost
// ----------------------------
export const applyBoost = async (sessionId: string, amount: number) => {
  const { data, error } = await supabase
    .from("mining_sessions")
    .update({
      boosted_rate: amount,
    })
    .eq("id", sessionId)
    .select()
    .single();

  if (error) console.log("Error applying boost:", error);

  return data;
};

// ----------------------------
// Get Total Mined Balance
// ----------------------------
export const getUserMiningBalance = async (userId: string) => {
  const { data, error } = await supabase.rpc("get_user_balance", { user_id_input: userId });

  if (error) {
    console.log("Error fetching balance:", error);
    return 0;
  }

  return data ?? 0;
};

// ----------------------------
// Claim Daily Reward
// ----------------------------
export const claimDailyReward = async (userId: string) => {
  const { data, error } = await supabase.rpc("claim_daily_reward", {
    user_id_input: userId,
  });

  if (error) {
    console.log("Error claiming reward:", error);
    return { success: false, message: error.message };
  }

  return { success: true, message: "Reward claimed!" };
};
