// ==================== MEMORY CLEANUP UTILITIES ====================
// Centralized cleanup functions to prevent memory leaks from unbounded Maps

import { SECURITY_THRESHOLDS } from "./constants.js";

// Type definitions for the tracked maps
type TimestampMap = Map<string, number[]>;
type ViolationMap = Map<string, { count: number; timestamp: number }>;
type ActionMap = Map<string, { executorId: string; targetId: string; timestamp: number }[]>;
type WhitelistedActionMap = Map<string, { executorId: string; type: "ban" | "channelDelete" | "roleDelete"; targetId: string; data: any; timestamp: number }[]>;
type StringSet = Set<string>;
type StringNumberMap = Map<string, number>;

// Global references (will be set by the main module)
let userSpamTrackerRef: TimestampMap | null = null;
let userViolationsRef: ViolationMap | null = null;
let userActionTimestampsRef: TimestampMap | null = null;
let guildBurstActionsRef: TimestampMap | null = null;
let guildPanicBurstActionsRef: TimestampMap | null = null;
let globalBanActionsRef: ActionMap | null = null;
let globalJoinHistoryRef: TimestampMap | null = null;
let globalLeaveHistoryRef: TimestampMap | null = null;
let recentWhitelistedActionsRef: WhitelistedActionMap | null = null;
let whitelistActionTimestampsRef: TimestampMap | null = null;
let botCreatedChannelIdsRef: StringSet | null = null;
let botDeletedChannelIdsRef: StringSet | null = null;
let botCreatedRoleIdsRef: StringSet | null = null;
let botDeletedRoleIdsRef: StringSet | null = null;
let botCreatingChannelNamesRef: StringNumberMap | null = null;
let botCreatingRoleNamesRef: StringNumberMap | null = null;
let recentProcessedKicksRef: StringSet | null = null;
let sequentialKickBanTrackerRef: TimestampMap | null = null;
let raidActionCounterRef: Map<string, number> | null = null;

export function registerTrackerReferences(refs: {
  userSpamTracker: TimestampMap;
  userViolations: ViolationMap;
  userActionTimestamps: TimestampMap;
  guildBurstActions: TimestampMap;
  guildPanicBurstActions: TimestampMap;
  globalBanActions: ActionMap;
  globalJoinHistory: TimestampMap;
  globalLeaveHistory: TimestampMap;
  recentWhitelistedActions: WhitelistedActionMap;
  whitelistActionTimestamps: TimestampMap;
  botCreatedChannelIds: StringSet;
  botDeletedChannelIds: StringSet;
  botCreatedRoleIds: StringSet;
  botDeletedRoleIds: StringSet;
  botCreatingChannelNames: StringNumberMap;
  botCreatingRoleNames: StringNumberMap;
  recentProcessedKicks: StringSet;
  sequentialKickBanTracker: TimestampMap;
  raidActionCounter: Map<string, number>;
}) {
  userSpamTrackerRef = refs.userSpamTracker;
  userViolationsRef = refs.userViolations;
  userActionTimestampsRef = refs.userActionTimestamps;
  guildBurstActionsRef = refs.guildBurstActions;
  guildPanicBurstActionsRef = refs.guildPanicBurstActions;
  globalBanActionsRef = refs.globalBanActions;
  globalJoinHistoryRef = refs.globalJoinHistory;
  globalLeaveHistoryRef = refs.globalLeaveHistory;
  recentWhitelistedActionsRef = refs.recentWhitelistedActions;
  whitelistActionTimestampsRef = refs.whitelistActionTimestamps;
  botCreatedChannelIdsRef = refs.botCreatedChannelIds;
  botDeletedChannelIdsRef = refs.botDeletedChannelIds;
  botCreatedRoleIdsRef = refs.botCreatedRoleIds;
  botDeletedRoleIdsRef = refs.botDeletedRoleIds;
  botCreatingChannelNamesRef = refs.botCreatingChannelNames;
  botCreatingRoleNamesRef = refs.botCreatingRoleNames;
  recentProcessedKicksRef = refs.recentProcessedKicks;
  sequentialKickBanTrackerRef = refs.sequentialKickBanTracker;
  raidActionCounterRef = refs.raidActionCounter;
}

function cleanupTimestampMap(map: TimestampMap, maxAgeMs: number): void {
  const now = Date.now();
  for (const [key, timestamps] of map.entries()) {
    const valid = timestamps.filter(t => now - t < maxAgeMs);
    if (valid.length === 0) {
      map.delete(key);
    } else {
      map.set(key, valid);
    }
  }
}

function cleanupViolationMap(map: ViolationMap, maxAgeMs: number): void {
  const now = Date.now();
  for (const [key, data] of map.entries()) {
    if (now - data.timestamp > maxAgeMs) {
      map.delete(key);
    }
  }
}

function cleanupActionMap(map: ActionMap, maxAgeMs: number): void {
  const now = Date.now();
  for (const [guildId, actions] of map.entries()) {
    const filtered = actions.filter(a => now - a.timestamp < maxAgeMs);
    if (filtered.length === 0) {
      map.delete(guildId);
    } else {
      map.set(guildId, filtered);
    }
  }
}

function cleanupWhitelistedActionMap(map: WhitelistedActionMap, maxAgeMs: number): void {
  const now = Date.now();
  for (const [guildId, actions] of map.entries()) {
    const filtered = actions.filter(a => now - a.timestamp < maxAgeMs);
    if (filtered.length === 0) {
      map.delete(guildId);
    } else {
      map.set(guildId, filtered);
    }
  }
}

function cleanupStringSet(set: StringSet): void {
  // These sets have their own TTL via setTimeout, but we can enforce a max size
  if (set.size > 10000) {
    set.clear();
  }
}

function cleanupStringNumberMap(map: StringNumberMap, maxAgeMs: number): void {
  const now = Date.now();
  for (const [key, timestamp] of map.entries()) {
    if (now - timestamp > maxAgeMs) {
      map.delete(key);
    }
  }
}

export function performMemoryCleanup(): void {
  const now = Date.now();
  
  // Cleanup timestamp maps
  if (userSpamTrackerRef) cleanupTimestampMap(userSpamTrackerRef, SECURITY_THRESHOLDS.SPAM_TRACKER_MAX_AGE_MS);
  if (userActionTimestampsRef) cleanupTimestampMap(userActionTimestampsRef, SECURITY_THRESHOLDS.USER_ACTION_MAX_AGE_MS);
  if (guildBurstActionsRef) cleanupTimestampMap(guildBurstActionsRef, SECURITY_THRESHOLDS.GUILD_ACTION_MAX_AGE_MS);
  if (guildPanicBurstActionsRef) cleanupTimestampMap(guildPanicBurstActionsRef, SECURITY_THRESHOLDS.GUILD_ACTION_MAX_AGE_MS);
  if (whitelistActionTimestampsRef) cleanupTimestampMap(whitelistActionTimestampsRef, SECURITY_THRESHOLDS.WHITELIST_ACTION_MAX_AGE_MS);
  if (sequentialKickBanTrackerRef) cleanupTimestampMap(sequentialKickBanTrackerRef, SECURITY_THRESHOLDS.SEQUENTIAL_KICK_BAN_WINDOW_MS);
  
  // Cleanup violation map
  if (userViolationsRef) cleanupViolationMap(userViolationsRef, SECURITY_THRESHOLDS.VIOLATION_MAX_AGE_MS);
  
  // Cleanup action maps
  if (globalBanActionsRef) cleanupActionMap(globalBanActionsRef, SECURITY_THRESHOLDS.GLOBAL_TRACKER_MAX_AGE_MS);
  if (globalJoinHistoryRef) cleanupTimestampMap(globalJoinHistoryRef, SECURITY_THRESHOLDS.GLOBAL_TRACKER_MAX_AGE_MS);
  if (globalLeaveHistoryRef) cleanupTimestampMap(globalLeaveHistoryRef, SECURITY_THRESHOLDS.GLOBAL_TRACKER_MAX_AGE_MS);
  if (recentWhitelistedActionsRef) cleanupWhitelistedActionMap(recentWhitelistedActionsRef, SECURITY_THRESHOLDS.BOT_MEMORY_TTL_MS);
  
  // Cleanup string-number maps
  if (botCreatingChannelNamesRef) cleanupStringNumberMap(botCreatingChannelNamesRef, SECURITY_THRESHOLDS.BOT_CREATING_TTL_MS);
  if (botCreatingRoleNamesRef) cleanupStringNumberMap(botCreatingRoleNamesRef, SECURITY_THRESHOLDS.BOT_CREATING_TTL_MS);
  
  // Cleanup string sets (enforce max size)
  if (botCreatedChannelIdsRef) cleanupStringSet(botCreatedChannelIdsRef);
  if (botDeletedChannelIdsRef) cleanupStringSet(botDeletedChannelIdsRef);
  if (botCreatedRoleIdsRef) cleanupStringSet(botCreatedRoleIdsRef);
  if (botDeletedRoleIdsRef) cleanupStringSet(botDeletedRoleIdsRef);
  if (recentProcessedKicksRef) cleanupStringSet(recentProcessedKicksRef);
  
  // Cleanup raid counter
  if (raidActionCounterRef && raidActionCounterRef.size > 10000) {
    raidActionCounterRef.clear();
  }
}

// Periodic cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null;

export function startMemoryCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  cleanupInterval = setInterval(performMemoryCleanup, SECURITY_THRESHOLDS.MEMORY_CLEANUP_INTERVAL_MS);
}

export function stopMemoryCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}