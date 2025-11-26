// src/services/ads.ts

import {
  RewardedAd,
  RewardedAdEventType,
  AdEventType,
  TestIds
} from "react-native-google-mobile-ads";

import { supabase } from "../../lib/supabase";
import type { AdType } from "../types";
import { DAILY_REWARD_AMOUNT } from "./mining.utils";

const REWARDED_AD_UNIT = TestIds.REWARDED;

/**
 * ALWAYS create a new rewardedAd instance per play.
 */
function createRewardedAd() {
  return RewardedAd.createForAdRequest(REWARDED_AD_UNIT);
}

let preloadedAd: ReturnType<typeof createRewardedAd> | null = null;

/**
 * Preload rewarded ads for smoother UX
 */
export function loadRewardedAd() {
  try {
    preloadedAd = createRewardedAd();
    preloadedAd.load();
  } catch (e) {
    console.warn("Preload rewardedAd error:", e);
    preloadedAd = null;
  }
}

/**
 * showRewardedAd
 * Clean, safe, stable, zero-duplicate-callback version.
 */
export async function showRewardedAd(
  adType: AdType,
  userId?: string | null
): Promise<boolean> {
  const rewardedAd = preloadedAd ?? createRewardedAd();

  // prevent reusing old ad
  preloadedAd = null;

  return new Promise<boolean>((resolve) => {
    let earnedReward = false;
    let hasResolved = false;

    const finish = async (success: boolean) => {
      if (hasResolved) return;
      hasResolved = true;

      // Log to Supabase
      try {
        await supabase.from("ad_interactions").insert({
          user_id: userId ?? null,
          ad_type: adType,
          completed: success,
          reward:
            success && adType === "daily_reward"
              ? DAILY_REWARD_AMOUNT
              : 0
        });
      } catch (e) {
        console.warn("Failed to log ad_interaction:", e);
      }

      // Preload next ad in background
      try {
        loadRewardedAd();
      } catch {}

      resolve(success);
    };

    // Cleanup helper
    const cleanup = () => {
      try {
        onLoaded();
        onEarned();
        onClosed();
        onError();
      } catch {}
    };

    // -----------------------------------------
    // EVENT LISTENERS (Correct for v16+)
    // -----------------------------------------

    const onLoaded = rewardedAd.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        try {
          rewardedAd.show();
        } catch (e) {
          console.warn("RewardedAd.show error:", e);
          cleanup();
          finish(false);
        }
      }
    );

    const onEarned = rewardedAd.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        earnedReward = true;
      }
    );

    // FIXED: “CLOSED” comes from AdEventType, not RewardedAdEventType
    const onClosed = rewardedAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        cleanup();
        finish(earnedReward);
      }
    );

    // FIXED: “FAILED_TO_LOAD” → AdEventType.ERROR
    const onError = rewardedAd.addAdEventListener(
      AdEventType.ERROR,
      (error) => {
        console.warn("RewardedAd load/show error:", error);
        cleanup();
        finish(false);
      }
    );

    // -----------------------------------------
    // Start loading the ad
    // -----------------------------------------
    try {
      rewardedAd.load();
    } catch (e) {
      console.warn("rewardedAd.load exception:", e);
      cleanup();
      finish(false);
    }
  });
}
