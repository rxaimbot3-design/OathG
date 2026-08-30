import { describe, it, expect, vi } from "vitest";
import { PermissionFlags, isDiscordV15, hasPermission, isEffectiveAdmin } from "../src/bot/compat/discord-v15-shims";

describe("discord-v15-shims", () => {
  it("reports v14 as not v15", () => {
    expect(isDiscordV15()).toBe(false);
  });

  it("hasPermission returns false for non-existent member", () => {
    expect(hasPermission(null, PermissionFlags.CreateInstantInvite)).toBe(false);
  });

  it("hasPermission returns member permission status", () => {
    const member = { permissions: { has: vi.fn(() => true) } };
    expect(hasPermission(member as any, PermissionFlags.CreateInstantInvite)).toBe(true);
  });

  it("isEffectiveAdmin returns false for null member", () => {
    expect(isEffectiveAdmin(null)).toBe(false);
  });

  it("isEffectiveAdmin returns true for Administrator", () => {
    const member = { permissions: { has: (p: any) => p === PermissionFlags.Administrator } };
    expect(isEffectiveAdmin(member as any)).toBe(true);
  });

  it("isEffectiveAdmin returns true for ManageGuild", () => {
    const member = { permissions: { has: (p: any) => p === PermissionFlags.ManageGuild } };
    expect(isEffectiveAdmin(member as any)).toBe(true);
  });

  it("isEffectiveAdmin returns true for BanMembers", () => {
    const member = { permissions: { has: (p: any) => p === PermissionFlags.BanMembers } };
    expect(isEffectiveAdmin(member as any)).toBe(true);
  });

  it("isEffectiveAdmin returns true for KickMembers", () => {
    const member = { permissions: { has: (p: any) => p === PermissionFlags.KickMembers } };
    expect(isEffectiveAdmin(member as any)).toBe(true);
  });

  it("isEffectiveAdmin returns true for ManageChannels", () => {
    const member = { permissions: { has: (p: any) => p === PermissionFlags.ManageChannels } };
    expect(isEffectiveAdmin(member as any)).toBe(true);
  });

  it("isEffectiveAdmin returns true for ManageRoles", () => {
    const member = { permissions: { has: (p: any) => p === PermissionFlags.ManageRoles } };
    expect(isEffectiveAdmin(member as any)).toBe(true);
  });

  it("isEffectiveAdmin returns false for regular member", () => {
    const member = { permissions: { has: () => false } };
    expect(isEffectiveAdmin(member as any)).toBe(false);
  });
});
