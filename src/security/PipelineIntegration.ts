/**
 * Security Pipeline Integration
 * 
 * Provides functions to enqueue Discord events into the UltraLowLatencyPipeline
 * for high-performance security processing alongside the existing EnhancedEventEngine.
 */

import { ultraLowLatencyPipeline, UltraLowLatencyPipeline } from "../core/UltraLowLatencyPipeline.js";

/**
 * Enqueue a security event into the UltraLowLatencyPipeline for high-speed processing.
 * This runs in parallel with the existing EnhancedEventEngine.intercept() path.
 * 
 * @param type - Event type (e.g., "channelDelete", "roleDelete", "guildBanAdd")
 * @param guildId - Discord guild ID
 * @param payload - Event-specific payload data
 * @param priority - Event priority: "critical" | "high" | "normal" | "low"
 */
export async function enqueueSecurityEvent(
  type: string,
  guildId: string,
  payload: Record<string, any>,
  priority: "critical" | "high" | "normal" | "low" = "high"
): Promise<string | null> {
  try {
    const eventId = await ultraLowLatencyPipeline.enqueue({
      type,
      guildId,
      payload,
      priority
    });
    return eventId;
  } catch (err) {
    // Pipeline full or other error - log but don't block the main event handler
    console.warn(`[Pipeline] Failed to enqueue ${type} event:`, err);
    return null;
  }
}

/**
 * Convenience functions for specific Discord event types
 */

export async function enqueueChannelDelete(guildId: string, channelId: string, channelName: string, channelType: number): Promise<string | null> {
  return enqueueSecurityEvent("channelDelete", guildId, {
    channelId,
    channelName,
    channelType
  }, "critical");
}

export async function enqueueChannelCreate(guildId: string, channelId: string, channelName: string, channelType: number): Promise<string | null> {
  return enqueueSecurityEvent("channelCreate", guildId, {
    channelId,
    channelName,
    channelType
  }, "high");
}

export async function enqueueRoleDelete(guildId: string, roleId: string, roleName: string): Promise<string | null> {
  return enqueueSecurityEvent("roleDelete", guildId, {
    roleId,
    roleName
  }, "critical");
}

export async function enqueueRoleCreate(guildId: string, roleId: string, roleName: string): Promise<string | null> {
  return enqueueSecurityEvent("roleCreate", guildId, {
    roleId,
    roleName
  }, "high");
}

export async function enqueueRoleUpdate(guildId: string, roleId: string, oldPermissions: string, newPermissions: string): Promise<string | null> {
  return enqueueSecurityEvent("roleUpdate", guildId, {
    roleId,
    oldPermissions,
    newPermissions
  }, "high");
}

export async function enqueueGuildBanAdd(guildId: string, userId: string, executorId?: string): Promise<string | null> {
  return enqueueSecurityEvent("guildBanAdd", guildId, {
    userId,
    executorId
  }, "critical");
}

export async function enqueueGuildMemberRemove(guildId: string, userId: string, executorId?: string): Promise<string | null> {
  return enqueueSecurityEvent("guildMemberRemove", guildId, {
    userId,
    executorId
  }, "critical");
}

export async function enqueueWebhookCreate(guildId: string, webhookId: string, executorId?: string): Promise<string | null> {
  return enqueueSecurityEvent("webhookCreate", guildId, {
    webhookId,
    executorId
  }, "high");
}

export async function enqueueBotAdd(guildId: string, botId: string, executorId?: string): Promise<string | null> {
  return enqueueSecurityEvent("botAdd", guildId, {
    botId,
    executorId
  }, "high");
}

export async function enqueueMessageCreate(guildId: string, messageId: string, authorId: string, content: string): Promise<string | null> {
  return enqueueSecurityEvent("messageCreate", guildId, {
    messageId,
    authorId,
    content: content.slice(0, 100) // Truncate for memory efficiency
  }, "normal");
}

export async function enqueuePermissionUpdate(guildId: string, targetId: string, targetType: "channel" | "role", executorId?: string): Promise<string | null> {
  return enqueueSecurityEvent("permissionUpdate", guildId, {
    targetId,
    targetType,
    executorId
  }, "high");
}

/**
 * Get pipeline metrics for monitoring
 */
export function getPipelineMetrics() {
  return ultraLowLatencyPipeline.getMetrics();
}

/**
 * Initialize the pipeline integration (called at startup)
 */
export async function initializePipelineIntegration(): Promise<void> {
  // Ensure pipeline singleton is created and ready
  UltraLowLatencyPipeline.getInstance();
  
  // The handlers are registered in UltimateIntegration.setupUltraLowLatencyHandlers()
  // This just ensures the pipeline is initialized
  console.log("[Pipeline] Security pipeline integration initialized");
}