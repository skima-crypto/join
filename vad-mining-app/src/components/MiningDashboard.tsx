// src/components/MiningDashboard.tsx
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ActivityIndicator, Alert, Pressable } from "react-native";
import { MotiView } from "moti";
import { useAuth } from "@/context/AuthContext";
import {
  getMiningState,
  startMining,
  claimMiningRewards,
  applyBoost,
  claimDailyReward,
  stopMining,
} from "@/services/mining";
import { showRewardedAd, loadRewardedAd } from "@/services/ads";
import { format } from "date-fns";

export default function MiningDashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [dailyClaiming, setDailyClaiming] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  // Fetch mining state
  async function refresh() {
    if (!userId) return;
    try {
      setLoading(true);
      const s = await getMiningState(userId);
      setState(s);
    } catch (e) {
      console.warn("refresh error", e);
    } finally {
      setLoading(false);
    }
  }

  // Initial + polling
  useEffect(() => {
    try {
      loadRewardedAd();
    } catch {}
    refresh();

    const poll = setInterval(() => {
      setRefreshTick((t) => t + 1);
      refresh();
    }, 15000);

    return () => clearInterval(poll);
  }, [userId]);

  useEffect(() => {
    if (userId) refresh();
  }, [refreshTick]);

  const session = state?.session ?? null;
  const accumulated = Number(state?.accumulated ?? 0);

  const meterProgress = useMemo(() => {
    const cap = 5;
    return Math.min(1, accumulated / cap);
  }, [accumulated]);

  const sessionText = useMemo(() => {
    if (!session) return "Not mining";
    const started = session.start_time
      ? format(new Date(session.start_time), "MMM d, HH:mm")
      : "unknown";
    return `Started: ${started}`;
  }, [session]);

  // ACTIONS
  async function handleStartWatchAdThenStart() {
    if (!userId) return Alert.alert("Sign in required");
    setStarting(true);
    try {
      const watched = await showRewardedAd();

      if (!watched) {
        Alert.alert("Ad not completed", "You must watch the ad to start mining.");
        return;
      }
      const res = await startMining(userId);
      if (res?.started) {
        Alert.alert("Mining started", "Your session runs for 24 hours.");
      } else if (res?.reason === "active_session") {
        Alert.alert("Already mining", "You already have an active session.");
      }
      await refresh();
    } catch (e) {
      Alert.alert("Error", "Failed to start mining.");
    } finally {
      setStarting(false);
    }
  }

  async function handleClaim() {
    if (!userId) return Alert.alert("Sign in required");
    setClaiming(true);
    try {
      const r = await claimMiningRewards(userId);
      if (r?.credited) {
        Alert.alert("Claim successful", `${r.credited} VAD credited`);
      } else if (r?.already) {
        Alert.alert("Already claimed", `Already claimed ${r.credited} VAD.`);
      } else {
        Alert.alert("Nothing to claim", r?.reason ?? "No rewards");
      }
      await refresh();
    } catch {
      Alert.alert("Error", "Failed to claim rewards.");
    } finally {
      setClaiming(false);
    }
  }

  async function handleBoostWithAd() {
    if (!userId) return Alert.alert("Sign in required");
    setBoosting(true);
    try {
      const watched = await showRewardedAd();
      if (!watched) return Alert.alert("Boost not applied", "Ad not completed.");

      const r = await applyBoost(userId);
      if (r?.applied) Alert.alert("Boost applied", "Boost active for 10 minutes.");
      await refresh();
    } catch {
      Alert.alert("Error", "Failed to apply boost.");
    } finally {
      setBoosting(false);
    }
  }

  async function handleDailyRewardWithAd() {
    if (!userId) return Alert.alert("Sign in required");
    setDailyClaiming(true);
    try {
      const watched = await showRewardedAd();
      if (!watched) return Alert.alert("No reward", "Ad not completed.");

      const r = await claimDailyReward(userId);
      if (r?.claimed) Alert.alert("Daily reward", `+${r.tx?.amount ?? 0} VAD`);
      await refresh();
    } catch {
      Alert.alert("Error", "Failed to claim daily reward.");
    } finally {
      setDailyClaiming(false);
    }
  }

  async function handleStopMining() {
    if (!userId) return;
    try {
      const r = await stopMining(userId);
      if (r?.stopped) Alert.alert("Mining stopped", "Session ended.");
      await refresh();
    } catch {
      Alert.alert("Error", "Failed to stop mining.");
    }
  }

  // RENDER
  if (loading && !state) {
    return (
      <View className="flex-1 items-center justify-center p-6">
        <ActivityIndicator size="large" />
        <Text className="mt-3 text-gray-500">Loading mining state…</Text>
      </View>
    );
  }

  return (
    <View className="p-4 flex-1 bg-white dark:bg-black">
      {/* HEADER */}
      <View className="flex-row items-center justify-between mb-4">
        <View>
          <Text className="text-2xl font-bold">Mining Dashboard</Text>
          <Text className="text-sm text-gray-500">{sessionText}</Text>
        </View>

        <MotiView
          from={{ scale: 0.9, opacity: 0.9 }}
          animate={{ scale: 1.05, opacity: 1 }}
          transition={{ loop: true, type: "timing", duration: 1200 }}
          className="p-3 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500"
        >
          <Text className="text-white font-bold">⛏</Text>
        </MotiView>
      </View>

      {/* RATE + ACCUM */}
      <View className="mb-4">
        <Text className="text-sm text-gray-500">Rate</Text>
        <Text className="text-xl font-semibold">
          {session
            ? `${session.mining_rate ?? "–"} VAD/hr`
            : `${state?.breakdown?.baseHourRate ?? "–"} VAD/hr`}
        </Text>

        <Text className="text-sm text-gray-500 mt-3">Accumulated</Text>
        <View className="flex-row items-center justify-between">
          <Text className="text-3xl font-bold">
            {accumulated.toFixed(4)} VAD
          </Text>
          <Text className="text-sm text-gray-500">
            Boosts: {state?.boosts?.usedToday ?? 0}/
            {state?.boosts?.allowedPerDay ?? "–"}
          </Text>
        </View>
      </View>

      {/* METER */}
      <View className="mb-4">
        <View className="h-4 bg-gray-200 rounded-full overflow-hidden">
          <MotiView
            style={{ width: `${meterProgress * 100}%` }}
            transition={{ type: "timing", duration: 800 }}
            className="h-4 bg-gradient-to-r from-emerald-400 to-blue-500"
          />
        </View>
        <Text className="text-xs text-gray-500 mt-2">
          Progress toward 5 VAD
        </Text>
      </View>

      {/* BREAKDOWN */}
      <View className="mb-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900">
        <Text className="font-semibold mb-1">Session breakdown</Text>
        <Text className="text-sm text-gray-600">
          Normal minutes: {state?.breakdown?.normalMinutes ?? 0}
        </Text>
        <Text className="text-sm text-gray-600">
          Boosted minutes: {state?.breakdown?.boostedMinutes ?? 0}
        </Text>
        <Text className="text-sm text-gray-600">
          Active users (24h): {state?.breakdown?.activeUsers ?? "–"}
        </Text>
      </View>

      {/* BUTTONS */}
      <View className="space-y-3">
        {session ? (
          <>
            <Pressable
              onPress={handleClaim}
              disabled={claiming}
              className="p-3 rounded-xl bg-blue-600"
            >
              <Text className="text-white text-center font-semibold">
                {claiming ? "Claiming..." : "Claim Rewards"}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleBoostWithAd}
              disabled={
                boosting ||
                (state?.boosts?.usedToday ?? 0) >=
                  (state?.boosts?.allowedPerDay ?? 3)
              }
              className={`p-3 rounded-xl ${
                (state?.boosts?.usedToday ?? 0) >=
                (state?.boosts?.allowedPerDay ?? 3)
                  ? "bg-gray-400"
                  : "bg-orange-500"
              }`}
            >
              <Text className="text-white text-center font-semibold">
                {boosting ? "Applying..." : "Boost (Watch Ad)"}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleStopMining}
              className="p-3 rounded-xl bg-red-600"
            >
              <Text className="text-white text-center font-semibold">
                Stop Mining
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={handleStartWatchAdThenStart}
            className="p-3 rounded-xl bg-green-600"
          >
            <Text className="text-white text-center font-semibold">
              {starting ? "Starting..." : "Start Mining (Watch Ad)"}
            </Text>
          </Pressable>
        )}

        <Pressable
          onPress={handleDailyRewardWithAd}
          disabled={
            dailyClaiming ||
            (state?.dailyReward?.usedToday ?? 0) >=
              (state?.dailyReward?.allowedPerDay ?? 3)
          }
          className={`p-3 rounded-xl ${
            (state?.dailyReward?.usedToday ?? 0) >=
            (state?.dailyReward?.allowedPerDay ?? 3)
              ? "bg-gray-400"
              : "bg-purple-600"
          }`}
        >
          <Text className="text-white text-center font-semibold">
            {dailyClaiming ? "Claiming..." : "Claim Daily Reward (Watch Ad)"}
          </Text>
        </Pressable>
      </View>

      <View className="mt-6">
        <Text className="text-xs text-gray-400">
          Tip: Ads must be fully watched. Data refreshes every 15s.
        </Text>
      </View>
    </View>
  );
}
