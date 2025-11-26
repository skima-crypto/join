// src/services/ads.ts

import {
  RewardedAd,
  InterstitialAd,
  AdEventType,
  RewardedAdEventType,
} from "react-native-google-mobile-ads";

// ----------------------------
// TEST AD UNITS (Google)
// Replace with your real IDs in production
// ----------------------------
const REWARDED_AD_ID = "ca-app-pub-3940256099942544/5224354917";
const INTERSTITIAL_AD_ID = "ca-app-pub-3940256099942544/1033173712";

// ----------------------------
// Create Ad Instances
// ----------------------------
export const rewardedAd = RewardedAd.createForAdRequest(REWARDED_AD_ID, {
  requestNonPersonalizedAdsOnly: true,
});

export const interstitialAd = InterstitialAd.createForAdRequest(
  INTERSTITIAL_AD_ID,
  {
    requestNonPersonalizedAdsOnly: true,
  }
);

// ----------------------------
// Load Rewarded Ad
// ----------------------------
export const loadRewardedAd = () => {
  if (!rewardedAd.loaded) {
    rewardedAd.load();
  }
};

// ----------------------------
// Show Rewarded Ad with Promise
// ----------------------------
export const showRewardedAd = (): Promise<boolean> => {
  return new Promise((resolve) => {
    loadRewardedAd();

    const unsubscribeLoaded = rewardedAd.addAdEventListener(
      RewardedAdEventType.LOADED,
      () => {
        rewardedAd.show();
      }
    );

    const unsubscribeEarned = rewardedAd.addAdEventListener(
      RewardedAdEventType.EARNED_REWARD,
      () => {
        resolve(true);
      }
    );

    const unsubscribeClosed = rewardedAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        resolve(false);
        rewardedAd.load(); // preload next ad
      }
    );

    const unsubscribeError = rewardedAd.addAdEventListener(
      AdEventType.ERROR,
      () => {
        resolve(false);
      }
    );

    setTimeout(() => {
      resolve(false);
    }, 10000);
  });
};

// ----------------------------
// Load Interstitial Ad
// ----------------------------
export const loadInterstitialAd = () => {
  if (!interstitialAd.loaded) {
    interstitialAd.load();
  }
};

// ----------------------------
// Show Interstitial Ad with Promise
// ----------------------------
export const showInterstitialAd = (): Promise<boolean> => {
  return new Promise((resolve) => {
    loadInterstitialAd();

    const unsubscribeLoaded = interstitialAd.addAdEventListener(
      AdEventType.LOADED,
      () => {
        interstitialAd.show();
      }
    );

    const unsubscribeClosed = interstitialAd.addAdEventListener(
      AdEventType.CLOSED,
      () => {
        resolve(true);
        interstitialAd.load();
      }
    );

    const unsubscribeError = interstitialAd.addAdEventListener(
      AdEventType.ERROR,
      () => {
        resolve(false);
      }
    );

    setTimeout(() => {
      resolve(false);
    }, 10000);
  });
};
