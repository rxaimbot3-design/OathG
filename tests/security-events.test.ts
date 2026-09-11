/**
 * Security Events Types Tests
 */

import { describe, it, expect } from 'vitest';
import type {
  SecurityEvent, SecurityActionEvent, VelocityEvent, ThreatDetectionEvent,
  PunishmentEvent, AuditLogEvent, ConfigChangeEvent, HealthCheckEvent,
  RateLimitEvent, IPBanEvent, HoneypotEvent, InviteEvent, BotJoinEvent,
  WebhookEvent, MemberJoinEvent, SentimentEvent, BehaviorScoreEvent,
  BackupEvent, SystemEvent, ThreatIndicator, AuditLogChange,
  HealthCheck, SystemMetrics, GeolocationData, MemberQualityFlags, BehaviorFactor
} from '../src/types/events.js';
import {
  createSecurityActionEvent, createVelocityEvent, createThreatDetectionEvent,
  createPunishmentEvent, createHealthCheckEvent, createSystemEvent
} from '../src/types/events.js';

describe('Security Events - Type Definitions', () => {
  describe('BaseSecurityEvent', () => {
    it('should have required fields', () => {
      const event: SecurityActionEvent = {
        eventId: '123456789012345678' as any,
        timestamp: Date.now() as any,
        guildId: '123456789012345678' as any,
        correlationId: 'test-correlation',
        actionType: 'channel_create',
        executorId: '987654321098765432' as any,
        targetId: '111111111111111111' as any,
        previousState: {},
        newState: {},
        isReverted: false,
        threatLevel: 3 as any
      };
      
      expect(event.eventId).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.guildId).toBeDefined();
      expect(event.correlationId).toBeDefined();
    });
  });

  describe('SecurityActionEvent', () => {
    it('should accept all action types', () => {
      const actionTypes = [
        'channel_create', 'channel_delete', 'channel_update',
        'role_create', 'role_delete', 'role_update',
        'member_ban_add', 'member_ban_remove', 'member_kick',
        'member_prune', 'member_role_update',
        'webhook_create', 'webhook_update', 'webhook_delete',
        'bot_add', 'integration_create', 'integration_update', 'integration_delete',
        'guild_update', 'invite_create', 'invite_delete',
        'message_delete', 'message_bulk_delete',
        'emoji_create', 'emoji_update', 'emoji_delete',
        'sticker_create', 'sticker_update', 'sticker_delete'
      ] as const;

      for (const actionType of actionTypes) {
        const event = createSecurityActionEvent({
          guildId: '123456789012345678' as any,
          actionType,
          executorId: '987654321098765432' as any,
          targetId: '111111111111111111' as any,
          previousState: { name: 'old' },
          newState: { name: 'new' },
          isReverted: false,
          threatLevel: 3 as any
        });
        
        expect(event.actionType).toBe(actionType);
      }
    });
  });

  describe('VelocityEvent', () => {
    it('should track action velocity', () => {
      const event = createVelocityEvent({
        guildId: '123456789012345678' as any,
        actionType: 'channel_delete',
        executorId: '987654321098765432' as any,
        count: 10,
        windowMs: 5000 as any,
        threshold: 5,
        exceeded: true
      });
      
      expect(event.count).toBe(10);
      expect(event.exceeded).toBe(true);
    });
  });

  describe('ThreatDetectionEvent', () => {
    it('should track threat indicators', () => {
      const indicators: ThreatIndicator[] = [
        {
          type: 'velocity',
          value: 50,
          weight: 0.8,
          description: 'High velocity channel deletions'
        },
        {
          type: 'pattern',
          value: 'mass_delete',
          weight: 0.9,
          description: 'Mass deletion pattern detected'
        }
      ];

      const event = createThreatDetectionEvent({
        guildId: '123456789012345678' as any,
        threatType: 'nuke',
        severity: 'critical',
        indicators,
        confidence: 0.95,
        recommendedActions: ['lockdown', 'ban_executor', 'restore_channels']
      });
      
      expect(event.threatType).toBe('nuke');
      expect(event.severity).toBe('critical');
      expect(event.indicators).toHaveLength(2);
      expect(event.confidence).toBe(0.95);
    });
  });

  describe('PunishmentEvent', () => {
    it('should track all punishment types', () => {
      const punishmentTypes = [
        'ban', 'kick', 'timeout', 'role_strip',
        'channel_lockdown', 'ip_ban', 'quarantine'
      ] as const;

      for (const punishmentType of punishmentTypes) {
        const event = createPunishmentEvent({
          guildId: '123456789012345678' as any,
          punishmentType,
          targetId: '111111111111111111' as any,
          executorId: '987654321098765432' as any,
          reason: 'Test punishment',
          duration: 3600000 as any,
          success: true
        });
        
        expect(event.punishmentType).toBe(punishmentType);
        expect(event.success).toBe(true);
      }
    });
  });

  describe('HealthCheckEvent', () => {
    it('should track system health', () => {
      const checks: HealthCheck[] = [
        { name: 'discord_gateway', status: 'pass', latencyMs: 45 },
        { name: 'redis_connection', status: 'pass', latencyMs: 12 },
        { name: 'database_connection', status: 'warn', latencyMs: 250, details: 'Slow query detected' }
      ];

      const metrics: SystemMetrics = {
        memoryUsageMB: 256,
        cpuUsagePercent: 15.5,
        eventQueueSize: 42,
        activeConnections: 1200,
        shardLatencyMs: 45,
        apiLatencyMs: 89
      };

      const event = createHealthCheckEvent({
        guildId: '123456789012345678' as any,
        status: 'healthy',
        checks,
        metrics
      });
      
      expect(event.status).toBe('healthy');
      expect(event.checks).toHaveLength(3);
      expect(event.metrics.memoryUsageMB).toBe(256);
    });
  });

  describe('SystemEvent', () => {
    it('should track system lifecycle', () => {
      const event = createSystemEvent({
        type: 'startup',
        message: 'Bot started successfully',
        details: { version: '4.8.2', guilds: 42 }
      });
      
      expect(event.type).toBe('startup');
      expect(event.message).toBe('Bot started successfully');
      expect(event.details).toEqual({ version: '4.8.2', guilds: 42 });
    });
  });

  describe('Helper Functions', () => {
    it('should generate unique event IDs', () => {
      const event1 = createSecurityActionEvent({
        guildId: '123456789012345678' as any,
        actionType: 'channel_create',
        executorId: '987654321098765432' as any,
        targetId: '111111111111111111' as any,
        previousState: {},
        newState: {},
        isReverted: false,
        threatLevel: 1 as any
      });
      
      const event2 = createSecurityActionEvent({
        guildId: '123456789012345678' as any,
        actionType: 'channel_create',
        executorId: '987654321098765432' as any,
        targetId: '111111111111111111' as any,
        previousState: {},
        newState: {},
        isReverted: false,
        threatLevel: 1 as any
      });
      
      expect(event1.eventId).not.toBe(event2.eventId);
      expect(event1.correlationId).not.toBe(event2.correlationId);
    });

    it('should set timestamps correctly', () => {
      const before = Date.now();
      const event = createSystemEvent({
        type: 'startup',
        message: 'Test'
      });
      const after = Date.now();
      
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });
  });
});

describe('Security Event Type Union', () => {
  it('should accept all event types in union', () => {
    const events: SecurityEvent[] = [
      createSecurityActionEvent({
        guildId: '123456789012345678' as any,
        actionType: 'channel_create',
        executorId: '987654321098765432' as any,
        targetId: '111111111111111111' as any,
        previousState: {},
        newState: {},
        isReverted: false,
        threatLevel: 1 as any
      }),
      createVelocityEvent({
        guildId: '123456789012345678' as any,
        actionType: 'channel_delete',
        executorId: '987654321098765432' as any,
        count: 5,
        windowMs: 5000 as any,
        threshold: 3,
        exceeded: true
      }),
      createThreatDetectionEvent({
        guildId: '123456789012345678' as any,
        threatType: 'raid',
        severity: 'high',
        indicators: [],
        confidence: 0.8,
        recommendedActions: ['monitor']
      }),
      createPunishmentEvent({
        guildId: '123456789012345678' as any,
        punishmentType: 'ban',
        targetId: '111111111111111111' as any,
        executorId: '987654321098765432' as any,
        reason: 'Test',
        duration: null,
        success: true
      }),
      createHealthCheckEvent({
        guildId: '123456789012345678' as any,
        status: 'healthy',
        checks: [],
        metrics: {
          memoryUsageMB: 100,
          cpuUsagePercent: 5,
          eventQueueSize: 10,
          activeConnections: 500,
          shardLatencyMs: 30,
          apiLatencyMs: 50
        }
      }),
      createSystemEvent({
        type: 'startup',
        message: 'Test'
      })
    ];
    
    expect(events).toHaveLength(6);
    // Verify all are SecurityEvent
    for (const event of events) {
      expect(event).toHaveProperty('eventId');
      expect(event).toHaveProperty('timestamp');
    }
  });
});

describe('Supporting Types', () => {
  it('should allow ThreatIndicator with all fields', () => {
    const indicator: ThreatIndicator = {
      type: 'velocity',
      value: 100,
      weight: 0.9,
      description: 'Extreme velocity detected'
    };
    expect(indicator.weight).toBe(0.9);
  });

  it('should allow AuditLogChange', () => {
    const change: AuditLogChange = {
      key: 'name',
      oldValue: 'old-channel',
      newValue: 'new-channel'
    };
    expect(change.key).toBe('name');
  });

  it('should allow HealthCheck with details', () => {
    const check: HealthCheck = {
      name: 'database',
      status: 'fail',
      latencyMs: 5000,
      details: 'Connection timeout'
    };
    expect(check.details).toBe('Connection timeout');
  });

  it('should allow GeolocationData', () => {
    const geo: GeolocationData = {
      country: 'US',
      region: 'CA',
      city: 'San Francisco',
      isp: 'Cloudflare',
      isVpn: false,
      isProxy: false,
      isTor: false
    };
    expect(geo.country).toBe('US');
  });

  it('should allow MemberQualityFlags', () => {
    const flags: MemberQualityFlags = {
      isNewAccount: true,
      noAvatar: true,
      suspiciousName: false,
      knownRaidPattern: true,
      vpnDetected: false,
      proxyDetected: false,
      torDetected: false
    };
    expect(flags.isNewAccount).toBe(true);
  });

  it('should allow BehaviorFactor', () => {
    const factor: BehaviorFactor = {
      name: 'rapid_commands',
      weight: 0.7,
      value: 50,
      description: 'User executing commands too quickly'
    };
    expect(factor.weight).toBe(0.7);
  });
});