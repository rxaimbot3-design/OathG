/**
 * Branded Types Unit Tests
 * 
 * Tests for compile-time and runtime type safety
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  UserId, GuildId, ChannelId, RoleId, MessageId, WebhookId,
  InviteCode, IPAddress, Snowflake, Timestamp, UnixTimestamp, UnixTimestampMs,
  DurationMs, SecurityScore, ThreatLevel, PermissionBitfield, DiscordColor,
  Result, AsyncResult
} from '../src/types/branded.js';
import {
  createUserId, createGuildId, createChannelId, createRoleId, createMessageId,
  createWebhookId, createInviteCode, createIPAddress, createSnowflake,
  createTimestamp, createUnixTimestamp, createUnixTimestampMs, createDurationMs,
  createSecurityScore, createThreatLevel, createDiscordColor,
  isUserId, isGuildId, isChannelId, isRoleId, isMessageId, isIPAddress,
  ok, err, isOk, isErr
} from '../src/types/branded.js';

describe('Branded Types - Compile-time Safety', () => {
  describe('UserId', () => {
    it('should accept valid Discord user ID', () => {
      const id = createUserId('123456789012345678');
      expect(id).toBe('123456789012345678');
      expect(isUserId(id)).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(() => createUserId('invalid')).toThrow('Invalid UserId format');
      expect(() => createUserId('123')).toThrow('Invalid UserId format');
      expect(() => createUserId('')).toThrow('Invalid UserId format');
    });

    it('should work with type guards', () => {
      const valid: unknown = '123456789012345678';
      if (isUserId(valid)) {
        // TypeScript knows this is UserId here
        expect(typeof valid).toBe('string');
      }
    });
  });

  describe('GuildId', () => {
    it('should accept valid Discord guild ID', () => {
      const id = createGuildId('123456789012345678');
      expect(id).toBe('123456789012345678');
      expect(isGuildId(id)).toBe(true);
    });

    it('should reject invalid format', () => {
      expect(() => createGuildId('invalid')).toThrow('Invalid GuildId format');
    });
  });

  describe('ChannelId', () => {
    it('should accept valid Discord channel ID', () => {
      const id = createChannelId('123456789012345678');
      expect(id).toBe('123456789012345678');
      expect(isChannelId(id)).toBe(true);
    });
  });

  describe('RoleId', () => {
    it('should accept valid Discord role ID', () => {
      const id = createRoleId('123456789012345678');
      expect(id).toBe('123456789012345678');
      expect(isRoleId(id)).toBe(true);
    });
  });

  describe('MessageId', () => {
    it('should accept valid Discord message ID', () => {
      const id = createMessageId('123456789012345678');
      expect(id).toBe('123456789012345678');
      expect(isMessageId(id)).toBe(true);
    });
  });

  describe('WebhookId', () => {
    it('should accept valid Discord webhook ID', () => {
      const id = createWebhookId('123456789012345678');
      expect(id).toBe('123456789012345678');
    });
  });

  describe('InviteCode', () => {
    it('should accept valid invite code', () => {
      const code = createInviteCode('abc123XYZ');
      expect(code).toBe('abc123XYZ');
    });

    it('should reject invalid format', () => {
      expect(() => createInviteCode('')).toThrow('Invalid InviteCode format');
      expect(() => createInviteCode('a'.repeat(33))).toThrow('Invalid InviteCode format');
    });
  });

  describe('IPAddress', () => {
    it('should accept valid IPv4', () => {
      const ip = createIPAddress('192.168.1.1');
      expect(ip).toBe('192.168.1.1');
      expect(isIPAddress(ip)).toBe(true);
    });

    it('should accept valid IPv6', () => {
      const ip = createIPAddress('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(ip).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(isIPAddress(ip)).toBe(true);
    });

    it('should reject invalid IP', () => {
      expect(() => createIPAddress('999.999.999.999')).toThrow('Invalid IPAddress format');
      expect(() => createIPAddress('not.an.ip')).toThrow('Invalid IPAddress format');
      expect(isIPAddress('not.an.ip')).toBe(false);
    });
  });

  describe('Snowflake', () => {
    it('should accept valid snowflake', () => {
      const id = createSnowflake('123456789012345678');
      expect(id).toBe('123456789012345678');
    });

    it('should reject invalid format', () => {
      expect(() => createSnowflake('invalid')).toThrow('Invalid Snowflake format');
    });
  });

  describe('Timestamp', () => {
    it('should accept valid timestamp', () => {
      const ts = createTimestamp(Date.now());
      expect(ts).toBeGreaterThan(0);
    });

    it('should reject negative timestamp', () => {
      expect(() => createTimestamp(-1)).toThrow('Invalid Timestamp');
    });
  });

  describe('UnixTimestamp', () => {
    it('should accept valid unix timestamp', () => {
      const ts = createUnixTimestamp(Math.floor(Date.now() / 1000));
      expect(ts).toBeGreaterThan(0);
    });

    it('should reject out of range', () => {
      expect(() => createUnixTimestamp(-1)).toThrow('Invalid UnixTimestamp');
      expect(() => createUnixTimestamp(253402300800)).toThrow('Invalid UnixTimestamp');
    });
  });

  describe('UnixTimestampMs', () => {
    it('should accept valid unix timestamp ms', () => {
      const ts = createUnixTimestampMs(Date.now());
      expect(ts).toBeGreaterThan(0);
    });
  });

  describe('DurationMs', () => {
    it('should accept valid duration', () => {
      const dur = createDurationMs(5000);
      expect(dur).toBe(5000);
    });

    it('should reject negative duration', () => {
      expect(() => createDurationMs(-1)).toThrow('Invalid DurationMs');
    });
  });

  describe('SecurityScore', () => {
    it('should accept valid score 0-100', () => {
      expect(createSecurityScore(0)).toBe(0);
      expect(createSecurityScore(50)).toBe(50);
      expect(createSecurityScore(100)).toBe(100);
    });

    it('should reject out of range', () => {
      expect(() => createSecurityScore(-1)).toThrow('Invalid SecurityScore');
      expect(() => createSecurityScore(101)).toThrow('Invalid SecurityScore');
      expect(() => createSecurityScore(50.5)).toThrow('Invalid SecurityScore');
    });
  });

  describe('ThreatLevel', () => {
    it('should accept valid threat level 0-5', () => {
      expect(createThreatLevel(0)).toBe(0);
      expect(createThreatLevel(5)).toBe(5);
    });

    it('should reject out of range', () => {
      expect(() => createThreatLevel(-1)).toThrow('Invalid ThreatLevel');
      expect(() => createThreatLevel(6)).toThrow('Invalid ThreatLevel');
      expect(() => createThreatLevel(2.5)).toThrow('Invalid ThreatLevel');
    });
  });

  describe('DiscordColor', () => {
    it('should accept valid hex color', () => {
      expect(createDiscordColor(0x000000)).toBe(0x000000);
      expect(createDiscordColor(0xFFFFFF)).toBe(0xFFFFFF);
      expect(createDiscordColor(0xFF0000)).toBe(0xFF0000);
    });

    it('should reject out of range', () => {
      expect(() => createDiscordColor(-1)).toThrow('Invalid DiscordColor');
      expect(() => createDiscordColor(0x1000000)).toThrow('Invalid DiscordColor');
    });
  });

  describe('PermissionBitfield', () => {
    it('should accept bigint', () => {
      const perms = BigInt(8) as PermissionBitfield;
      expect(perms).toBe(BigInt(8));
    });
  });
});

describe('Result Type', () => {
  it('should create ok result', () => {
    const result = ok(42);
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe(42);
    }
  });

  it('should create err result', () => {
    const result = err(new Error('test'));
    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toBe('test');
    }
  });

  it('should distinguish ok from err', () => {
    const okResult = ok('success');
    const errResult = err(new Error('fail'));
    
    expect(isOk(okResult)).toBe(true);
    expect(isErr(okResult)).toBe(false);
    expect(isOk(errResult)).toBe(false);
    expect(isErr(errResult)).toBe(true);
  });

  it('should work with async results', async () => {
    const asyncResult: AsyncResult<string> = Promise.resolve(ok('async success'));
    const result = await asyncResult;
    expect(isOk(result)).toBe(true);
    if (isOk(result)) {
      expect(result.value).toBe('async success');
    }
  });
});

describe('Type Guards', () => {
  it('should correctly identify UserId', () => {
    expect(isUserId('123456789012345678')).toBe(true);
    expect(isUserId('123')).toBe(false);
    expect(isUserId(null)).toBe(false);
    expect(isUserId(undefined)).toBe(false);
    expect(isUserId(123)).toBe(false);
  });

  it('should correctly identify GuildId', () => {
    expect(isGuildId('123456789012345678')).toBe(true);
    expect(isGuildId('123')).toBe(false);
  });

  it('should correctly identify ChannelId', () => {
    expect(isChannelId('123456789012345678')).toBe(true);
  });

  it('should correctly identify RoleId', () => {
    expect(isRoleId('123456789012345678')).toBe(true);
  });

  it('should correctly identify MessageId', () => {
    expect(isMessageId('123456789012345678')).toBe(true);
  });

  it('should correctly identify IPAddress', () => {
    expect(isIPAddress('192.168.1.1')).toBe(true);
    expect(isIPAddress('2001:db8::1')).toBe(true);
    expect(isIPAddress('not.an.ip')).toBe(false);
    expect(isIPAddress(null)).toBe(false);
  });
});