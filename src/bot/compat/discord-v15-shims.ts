/**
 * Discord.js v14 → v15 compatibility shims.
 *
 * When discord.js v15 is released, these shims will be updated to map
 * v14 APIs to v15 APIs. For now, they are identity functions that
 * maintain the existing v14 behavior.
 *
 * Usage: import { PermissionFlags, GatewayIntents } from './discord-v15-shims';
 */

import { PermissionFlagsBits, GatewayIntentBits, ChannelType } from "discord.js";

// Permission flag numeric values (from discord.js v14)
const PF = {
  Administrator: PermissionFlagsBits.Administrator,
  ManageGuild: PermissionFlagsBits.ManageGuild,
  ManageChannels: PermissionFlagsBits.ManageChannels,
  ManageRoles: PermissionFlagsBits.ManageRoles,
  BanMembers: PermissionFlagsBits.BanMembers,
  KickMembers: PermissionFlagsBits.KickMembers,
  ManageWebhooks: PermissionFlagsBits.ManageWebhooks,
  ViewAuditLog: PermissionFlagsBits.ViewAuditLog,
  SendMessages: PermissionFlagsBits.SendMessages,
  EmbedLinks: PermissionFlagsBits.EmbedLinks,
  ReadMessageHistory: PermissionFlagsBits.ReadMessageHistory,
  Connect: PermissionFlagsBits.Connect,
  Speak: PermissionFlagsBits.Speak,
  UseExternalEmojis: PermissionFlagsBits.UseExternalEmojis,
  AddReactions: PermissionFlagsBits.AddReactions,
  CreateInstantInvite: PermissionFlagsBits.CreateInstantInvite,
} as const;

/**
 * Permission flag mappings that may change in v15.
 * Currently identity mappings.
 */
export const PermissionFlags = PF;

/**
 * Gateway intent mappings that may change in v15.
 * Currently identity mappings.
 */
export const GatewayIntents = {
  Guilds: GatewayIntentBits.Guilds,
  GuildMembers: GatewayIntentBits.GuildMembers,
  GuildMessages: GatewayIntentBits.GuildMessages,
  MessageContent: GatewayIntentBits.MessageContent,
  GuildVoiceStates: GatewayIntentBits.GuildVoiceStates,
  GuildInvites: GatewayIntentBits.GuildInvites,
  GuildWebhooks: GatewayIntentBits.GuildWebhooks,
  GuildMessageReactions: GatewayIntentBits.GuildMessageReactions,
} as const;

/**
 * Channel type mappings that may change in v15.
 * Currently identity mappings.
 */
export const ChannelTypes = {
  GuildText: ChannelType.GuildText,
  GuildVoice: ChannelType.GuildVoice,
  GuildCategory: ChannelType.GuildCategory,
  GuildAnnouncement: ChannelType.GuildAnnouncement,
  GuildStageVoice: ChannelType.GuildStageVoice,
  GuildForum: ChannelType.GuildForum,
  GuildMedia: ChannelType.GuildMedia,
} as const;

/**
 * Check if running on discord.js v15+.
 * Returns false until v15 is released and adopted.
 */
export function isDiscordV15(): boolean {
  return false;
}

/**
 * Version-agnostic permission check helper.
 */
export function hasPermission(
  member: any,
  permission: bigint
): boolean {
  return member?.permissions?.has(permission) ?? false;
}

/**
 * Version-agnostic effective admin check.
 */
export function isEffectiveAdmin(member: any): boolean {
  if (!member) return false;
  return (
    member.permissions?.has(PF.Administrator) ||
    member.permissions?.has(PF.ManageGuild) ||
    member.permissions?.has(PF.BanMembers) ||
    member.permissions?.has(PF.KickMembers) ||
    member.permissions?.has(PF.ManageChannels) ||
    member.permissions?.has(PF.ManageRoles)
  );
}
