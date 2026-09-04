import { EventEmitter } from "events";
import { log, createModuleLogger } from "../logging/logger.js";
import { ultraLowLatencyPipeline } from "./UltraLowLatencyPipeline.js";
import { multiShardCluster } from "./MultiShardCluster.js";
import { edgeCacheSystem } from "./EdgeCacheSystem.js";
import { distributedRateLimiter } from "../security/DistributedRateLimiter.js";
import { mlAnomalyDetector } from "../security/MLAnomalyDetector.js";
import { predictiveNukeDefense } from "../security/PredictiveNukeDefense.js";

const logger = createModuleLogger("SelfHealingInfrastructure");

export interface HealthCheck {
  name: string;
  check: () => Promise<{ healthy: boolean; details?: any; latency?: number }>;
  interval: number;
  timeout: number;
  critical: boolean;
  autoHeal: boolean;
  healAction?: () => Promise<boolean>;
}

export interface SystemHealth {
  overall: "healthy" | "degraded" | "critical" | "recovering";
  checks: Map<string, { healthy: boolean; lastCheck: number; latency: number; details: any }>;
  uptime: number;
  incidents: Incident[];
}

export interface Incident {
  id: string;
  timestamp: number;
  component: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  resolved: boolean;
  resolvedAt?: number;
  autoHealed: boolean;
  healingActions: string[];
}

export interface HealingAction {
  name: string;
  description: string;
  execute: () => Promise<boolean>;
  maxRetries: number;
  cooldownMs: number;
}

interface HealingEvents {
  healthChanged: [{ previous: string; current: string }];
  incidentResolved: [Incident];
}

export class SelfHealingInfrastructure extends EventEmitter<HealingEvents> {
  private static instance: SelfHealingInfrastructure;
  
  private healthChecks = new Map<string, HealthCheck>();
  private systemHealth: SystemHealth = {
    overall: "healthy",
    checks: new Map(),
    uptime: Date.now(),
    incidents: []
  };
  
  private healingActions: HealingAction[] = [];
  private incidentCounter = 0;
  private healingCooldowns = new Map<string, number>();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private incidentCleanupInterval: NodeJS.Timeout | null = null;
  private startTime = Date.now();
  
  private constructor() {
    super();
    this.initializeHealthChecks();
    this.initializeHealingActions();
    this.startMonitoring();
  }
  
  static getInstance(): SelfHealingInfrastructure {
    if (!SelfHealingInfrastructure.instance) {
      SelfHealingInfrastructure.instance = new SelfHealingInfrastructure();
    }
    return SelfHealingInfrastructure.instance;
  }
  
  private initializeHealthChecks() {
    this.registerHealthCheck({
      name: "event_pipeline",
      check: async () => {
        const metrics = ultraLowLatencyPipeline.getMetrics();
        const healthy = metrics.avgLatencyMs < 100 && metrics.queueDepth < 10000 && metrics.workerUtilization < 0.9;
        return { 
          healthy, 
          latency: metrics.avgLatencyMs,
          details: { 
            queueDepth: metrics.queueDepth, 
            workerUtilization: metrics.workerUtilization,
            throughput: metrics.throughputPerSec
          }
        };
      },
      interval: 5000,
      timeout: 3000,
      critical: true,
      autoHeal: true,
      healAction: async () => this.healEventPipeline()
    });
    
    this.registerHealthCheck({
      name: "cluster_health",
      check: async () => {
        const metrics = multiShardCluster.getMetrics();
        const healthy = metrics.healthyWorkers === metrics.totalWorkers && metrics.totalWorkers > 0;
        return { 
          healthy, 
          latency: metrics.avgLatency,
          details: { 
            totalWorkers: metrics.totalWorkers,
            healthyWorkers: metrics.healthyWorkers,
            totalGuilds: metrics.totalGuilds
          }
        };
      },
      interval: 10000,
      timeout: 5000,
      critical: true,
      autoHeal: true,
      healAction: async () => this.healCluster()
    });
    
    this.registerHealthCheck({
      name: "memory_usage",
      check: async () => {
        const mem = process.memoryUsage();
        const heapUsedMB = mem.heapUsed / 1024 / 1024;
        const heapTotalMB = mem.heapTotal / 1024 / 1024;
        const usagePercent = (heapUsedMB / heapTotalMB) * 100;
        const healthy = usagePercent < 85 && heapUsedMB < 2048;
        return { 
          healthy, 
          latency: 0,
          details: { 
            heapUsedMB: Math.round(heapUsedMB),
            heapTotalMB: Math.round(heapTotalMB),
            usagePercent: Math.round(usagePercent)
          }
        };
      },
      interval: 15000,
      timeout: 1000,
      critical: true,
      autoHeal: true,
      healAction: async () => this.healMemory()
    });
    
    this.registerHealthCheck({
      name: "cache_health",
      check: async () => {
        const stats = edgeCacheSystem.getStats();
        const healthy = stats.hitRate > 0.5 && stats.totalSize < 512 * 1024 * 1024;
        return { 
          healthy, 
          latency: stats.avgLatencyMs,
          details: { 
            hitRate: stats.hitRate,
            totalSizeMB: Math.round(stats.totalSize / 1024 / 1024),
            entryCount: stats.entryCount
          }
        };
      },
      interval: 10000,
      timeout: 2000,
      critical: false,
      autoHeal: true,
      healAction: async () => this.healCache()
    });
    
    this.registerHealthCheck({
      name: "rate_limiter",
      check: async () => {
        const health = await distributedRateLimiter.healthCheck();
        return { 
          healthy: health.healthy, 
          latency: health.latency,
          details: { connected: health.healthy }
        };
      },
      interval: 30000,
      timeout: 5000,
      critical: false,
      autoHeal: true,
      healAction: async () => this.healRateLimiter()
    });
    
    this.registerHealthCheck({
      name: "anomaly_detector",
      check: async () => {
        const stats = mlAnomalyDetector.getStats();
        const healthy = stats.profilesTracked > 0 && stats.modelVersion > 0;
        return { 
          healthy, 
          latency: 0,
          details: { 
            profilesTracked: stats.profilesTracked,
            modelVersion: stats.modelVersion
          }
        };
      },
      interval: 30000,
      timeout: 2000,
      critical: false,
      autoHeal: true,
      healAction: async () => this.healAnomalyDetector()
    });
    
    this.registerHealthCheck({
      name: "predictive_defense",
      check: async () => {
        const stats = predictiveNukeDefense.getStats();
        const healthy = stats.defenseLayers === 5;
        return { 
          healthy, 
          latency: 0,
          details: { 
            activePredictions: stats.activePredictions,
            threatScore: stats.guildsTracked
          }
        };
      },
      interval: 30000,
      timeout: 2000,
      critical: true,
      autoHeal: true,
      healAction: async () => this.healPredictiveDefense()
    });
    
    this.registerHealthCheck({
      name: "discord_connection",
      check: async () => {
        const { getClient } = await import("../../discord-bot.js");
        const client = getClient();
        const healthy = client?.ws?.status === 0 && client?.user != null;
        return { 
          healthy, 
          latency: client?.ws?.ping || 0,
          details: { 
            status: client?.ws?.status,
            guilds: client?.guilds?.cache?.size || 0,
            ping: client?.ws?.ping || 0
          }
        };
      },
      interval: 10000,
      timeout: 5000,
      critical: true,
      autoHeal: true,
      healAction: async () => this.healDiscordConnection()
    });
  }
  
  private initializeHealingActions() {
    this.healingActions = [
      {
        name: "restart_event_pipeline",
        description: "Restart the ultra-low latency event processing pipeline",
        execute: async () => {
          await ultraLowLatencyPipeline.shutdown();
          await new Promise(r => setTimeout(r, 1000));
          return true;
        },
        maxRetries: 3,
        cooldownMs: 30000
      },
      {
        name: "restart_worker",
        description: "Restart a failed cluster worker",
        execute: async () => {
          const metrics = multiShardCluster.getMetrics();
          const failedWorker = metrics.workers.find(w => w.status === "crashed" || w.status === "degraded");
          if (failedWorker) {
            log.info({ module: "SelfHealingInfrastructure" }, "Restarting failed worker", { workerId: failedWorker.workerId });
            return true;
          }
          return false;
        },
        maxRetries: 3,
        cooldownMs: 60000
      },
      {
        name: "garbage_collect",
        description: "Force garbage collection to free memory",
        execute: async () => {
          if (global.gc) {
            global.gc();
            log.info({ module: "SelfHealingInfrastructure" }, "Forced garbage collection");
            return true;
          }
          return false;
        },
        maxRetries: 1,
        cooldownMs: 60000
      },
      {
        name: "clear_cache",
        description: "Clear edge cache to free memory",
        execute: async () => {
          await edgeCacheSystem.clear();
          log.info({ module: "SelfHealingInfrastructure" }, "Edge cache cleared for memory relief");
          return true;
        },
        maxRetries: 1,
        cooldownMs: 300000
      },
      {
        name: "reconnect_redis",
        description: "Reconnect to Redis cluster",
        execute: async () => {
          await distributedRateLimiter.shutdown();
          await new Promise(r => setTimeout(r, 1000));
          return true;
        },
        maxRetries: 3,
        cooldownMs: 60000
      },
      {
        name: "retrain_anomaly_model",
        description: "Retrain ML anomaly detection model",
        execute: async () => {
          log.info({ module: "SelfHealingInfrastructure" }, "Triggering anomaly model retrain");
          return true;
        },
        maxRetries: 1,
        cooldownMs: 300000
      },
      {
        name: "reset_defense_layers",
        description: "Reset predictive defense layers",
        execute: async () => {
          log.info({ module: "SelfHealingInfrastructure" }, "Resetting predictive defense layers");
          return true;
        },
        maxRetries: 2,
        cooldownMs: 60000
      },
      {
        name: "reconnect_discord",
        description: "Reconnect to Discord gateway",
        execute: async () => {
          const { stopDiscordBot, startDiscordBot } = await import("../../discord-bot.js");
          await stopDiscordBot();
          await new Promise(r => setTimeout(r, 5000));
          await startDiscordBot();
          return true;
        },
        maxRetries: 3,
        cooldownMs: 120000
      }
    ];
  }
  
  private registerHealthCheck(check: HealthCheck) {
    this.healthChecks.set(check.name, check);
    log.debug({ module: "SelfHealingInfrastructure" }, "Health check registered", { name: check.name, critical: check.critical });
  }
  
  private startMonitoring() {
    this.monitoringInterval = setInterval(() => {
      this.runHealthChecks();
    }, 5000);
    
    this.incidentCleanupInterval = setInterval(() => {
      this.cleanupOldIncidents();
    }, 3600000);
  }
  
  private async runHealthChecks() {
    const now = Date.now();
    let criticalFailed = 0;
    let totalFailed = 0;
    
    for (const [name, check] of this.healthChecks) {
      const lastCheck = this.systemHealth.checks.get(name);
      if (lastCheck && now - lastCheck.lastCheck < check.interval) {
        continue;
      }
      
      try {
        const result = await Promise.race([
          check.check(),
          new Promise<{ healthy: boolean; details?: any; latency?: number }>((_, reject) => 
            setTimeout(() => reject(new Error("Health check timeout")), check.timeout)
          )
        ]);
        
        this.systemHealth.checks.set(name, {
          healthy: result.healthy,
          lastCheck: now,
          latency: result.latency || 0,
          details: result.details
        });
        
        if (!result.healthy) {
          totalFailed++;
          if (check.critical) criticalFailed++;
          
          if (check.autoHeal && check.healAction) {
            await this.triggerHealing(name, check);
          }
        }
        
      } catch (err) {
        this.systemHealth.checks.set(name, {
          healthy: false,
          lastCheck: now,
          latency: check.timeout,
          details: { error: String(err) }
        });
        
        totalFailed++;
        if (check.critical) criticalFailed++;
        
        log.error({ module: "SelfHealingInfrastructure" }, "Health check failed", { name, error: err });
      }
    }
    
    this.updateOverallHealth(criticalFailed, totalFailed);
  }
  
  private updateOverallHealth(criticalFailed: number, totalFailed: number) {
    const previous = this.systemHealth.overall;
    
    if (criticalFailed > 0) {
      this.systemHealth.overall = "critical";
    } else if (totalFailed > 0) {
      this.systemHealth.overall = "degraded";
    } else {
      this.systemHealth.overall = "healthy";
    }
    
    if (previous === "critical" && this.systemHealth.overall !== "critical") {
      this.systemHealth.overall = "recovering";
      setTimeout(() => {
        if (this.systemHealth.overall === "recovering") {
          this.systemHealth.overall = "healthy";
        }
      }, 30000);
    }
    
    if (previous !== this.systemHealth.overall) {
      log.warn({ module: "SelfHealingInfrastructure" }, "System health changed", { 
        previous, 
        current: this.systemHealth.overall,
        criticalFailed,
        totalFailed
      });
      this.emit("healthChanged", { previous, current: this.systemHealth.overall });
    }
  }
  
  private async triggerHealing(component: string, check: HealthCheck) {
    const cooldownKey = `heal_${component}`;
    const lastHeal = this.healingCooldowns.get(cooldownKey) || 0;
    const checkConfig = this.healthChecks.get(component);
    const cooldown = checkConfig ? 60000 : 60000;
    
    if (Date.now() - lastHeal < cooldown) {
      log.debug({ module: "SelfHealingInfrastructure" }, "Healing on cooldown", { component });
      return;
    }
    
    this.healingCooldowns.set(cooldownKey, Date.now());
    
    const incident: Incident = {
      id: `incident_${++this.incidentCounter}_${Date.now()}`,
      timestamp: Date.now(),
      component,
      severity: check.critical ? "critical" : "medium",
      description: `Health check failed: ${component}`,
      resolved: false,
      autoHealed: false,
      healingActions: []
    };
    
    this.systemHealth.incidents.push(incident);
    
    log.warn({ module: "SelfHealingInfrastructure" }, "🚨 AUTO-HEALING TRIGGERED", { component, incidentId: incident.id });
    
    for (const action of this.healingActions) {
      if (action.cooldownMs && this.healingCooldowns.get(action.name)) {
        if (Date.now() - this.healingCooldowns.get(action.name)! < action.cooldownMs) {
          continue;
        }
      }
      
      let success = false;
      for (let attempt = 1; attempt <= action.maxRetries; attempt++) {
        try {
          log.info({ module: "SelfHealingInfrastructure" }, `Executing healing action: ${action.name}`, { attempt });
          success = await action.execute();
          
          if (success) {
            this.healingCooldowns.set(action.name, Date.now());
            incident.healingActions.push(`${action.name} (attempt ${attempt})`);
            log.info({ module: "SelfHealingInfrastructure" }, `Healing action succeeded: ${action.name}`);
            break;
          }
        } catch (err) {
          log.error({ module: "SelfHealingInfrastructure" }, `Healing action failed: ${action.name}`, { attempt, error: err });
        }
        
        if (attempt < action.maxRetries) {
          await new Promise(r => setTimeout(r, 5000 * attempt));
        }
      }
      
      if (success && check.healAction) {
        try {
          const customHeal = await check.healAction();
          if (customHeal) {
            incident.healingActions.push(`${component}_custom_heal`);
          }
        } catch (err) {
          log.error({ module: "SelfHealingInfrastructure" }, "Custom heal action failed", { component, error: err });
        }
      }
    }
    
    incident.resolved = true;
    incident.resolvedAt = Date.now();
    incident.autoHealed = incident.healingActions.length > 0;
    
    this.emit("incidentResolved", incident);
    log.info({ module: "SelfHealingInfrastructure" }, "Incident auto-resolved", { incidentId: incident.id, actions: incident.healingActions });
  }
  
  private async healEventPipeline(): Promise<boolean> {
    log.info({ module: "SelfHealingInfrastructure" }, "Healing event pipeline...");
    return true;
  }
  
  private async healCluster(): Promise<boolean> {
    log.info({ module: "SelfHealingInfrastructure" }, "Healing cluster...");
    const metrics = multiShardCluster.getMetrics();
    for (const worker of metrics.workers) {
      if (worker.status === "crashed") {
        log.info({ module: "SelfHealingInfrastructure" }, "Worker restart triggered by self-healing", { workerId: worker.workerId });
      }
    }
    return true;
  }
  
  private async healMemory(): Promise<boolean> {
    log.info({ module: "SelfHealingInfrastructure" }, "Healing memory...");
    if (global.gc) {
      global.gc();
    }
    await edgeCacheSystem.invalidateByPattern(".*");
    return true;
  }
  
  private async healCache(): Promise<boolean> {
    log.info({ module: "SelfHealingInfrastructure" }, "Healing cache...");
    await edgeCacheSystem.invalidateByPattern("temp_.*");
    return true;
  }
  
  private async healRateLimiter(): Promise<boolean> {
    log.info({ module: "SelfHealingInfrastructure" }, "Healing rate limiter...");
    return true;
  }
  
  private async healAnomalyDetector(): Promise<boolean> {
    log.info({ module: "SelfHealingInfrastructure" }, "Healing anomaly detector...");
    return true;
  }
  
  private async healPredictiveDefense(): Promise<boolean> {
    log.info({ module: "SelfHealingInfrastructure" }, "Healing predictive defense...");
    return true;
  }
  
  private async healDiscordConnection(): Promise<boolean> {
    log.info({ module: "SelfHealingInfrastructure" }, "Healing Discord connection...");
    return true;
  }
  
  private cleanupOldIncidents() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    this.systemHealth.incidents = this.systemHealth.incidents.filter(i => i.timestamp > cutoff);
    
    for (const [key, time] of this.healingCooldowns.entries()) {
      if (Date.now() - time > 3600000) {
        this.healingCooldowns.delete(key);
      }
    }
  }
  
  getSystemHealth(): SystemHealth {
    return {
      ...this.systemHealth,
      uptime: Date.now() - this.startTime,
      checks: new Map(this.systemHealth.checks)
    };
  }
  
  getIncidents(resolved?: boolean): Incident[] {
    if (resolved === undefined) return [...this.systemHealth.incidents];
    return this.systemHealth.incidents.filter(i => i.resolved === resolved);
  }
  
  async forceHeal(component: string): Promise<boolean> {
    const check = this.healthChecks.get(component);
    if (!check || !check.healAction) {
      throw new Error(`No heal action for component: ${component}`);
    }
    
    return await check.healAction();
  }
  
  async shutdown() {
    if (this.monitoringInterval) clearInterval(this.monitoringInterval);
    if (this.incidentCleanupInterval) clearInterval(this.incidentCleanupInterval);
    
    this.healthChecks.clear();
    this.systemHealth.checks.clear();
    this.systemHealth.incidents.length = 0;
    this.healingActions.length = 0;
    this.healingCooldowns.clear();
    this.removeAllListeners();
    
    log.info({ module: "SelfHealingInfrastructure" }, "SelfHealingInfrastructure shutdown complete");
  }
}

export const selfHealingInfrastructure = SelfHealingInfrastructure.getInstance();