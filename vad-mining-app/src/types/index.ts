// src/types/index.ts
export type AdType = "initial" | "daily_boost" | "daily_reward";

export interface AdInteraction {
  id: string;
  user_id?: string | null;
  ad_type?: AdType | null;
  completed?: boolean | null;
  reward?: number | null;
  created_at?: string | null;
}

export interface DailyStatus {
  id: string;
  user_id?: string | null;
  last_boost_at?: string | null;
  last_daily_reward_at?: string | null;
  updated_at?: string | null;
}

export interface VADTransaction {
  id: string;
  user_id?: string | null;
  amount?: number | null;
  transaction_type?: "mine" | "daily_reward" | "boost" | "task_reward";
  description?: string | null;
  created_at?: string | null;
}

export interface MiningSession {
  id: string;
  user_id?: string | null;
  mining_rate?: number | null;
  boosted_rate?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  is_active?: boolean | null;
  total_earned?: number | null;
  created_at?: string | null;
}

export interface RewardEvent {
  type: string;
  amount?: number;
}
