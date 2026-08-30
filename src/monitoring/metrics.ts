/**
 * Prometheus Metrics
 * Provides standardized metrics collection for monitoring
 */

import { Registry, Counter, Gauge, Histogram, Summary, collectDefaultMetrics } from "prom-client";

export interface MetricsConfig {
  prefix?: string;
  collectDefaultMetrics?: boolean;
  defaultMetricsInterval?: number;
}

class MetricsManager {
  private static instance: MetricsManager;
  private registry: Registry;
  private metrics = new Map<string, Counter | Gauge | Histogram | Summary>();
  private config: Required<MetricsConfig>;

  private constructor(config: MetricsConfig = {}) {
    this.config = {
      prefix: config.prefix ?? "discord_bot_",
      collectDefaultMetrics: config.collectDefaultMetrics ?? true,
      defaultMetricsInterval: config.defaultMetricsInterval ?? 10000,
    };
    this.registry = new Registry();
    this.registry.setDefaultLabels({
      service: "discord-bot",
      environment: process.env.NODE_ENV ?? "development",
    });

    if (this.config.collectDefaultMetrics) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: this.config.prefix,
      });
    }
  }

  static getInstance(config?: MetricsConfig): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager(config);
    }
    return MetricsManager.instance;
  }

  static resetInstance(): void {
    MetricsManager.instance = undefined as any;
  }

  static async getMetrics(): Promise<string> {
    return this.getInstance().getRegistry().metrics();
  }

  static getContentType(): string {
    return this.getInstance().getRegistry().contentType;
  }

  getRegistry(): Registry {
    return this.registry;
  }

  // Counter - monotonically increasing
  createCounter(name: string, help: string, labelNames: string[] = []): Counter {
    const fullName = `${this.config.prefix}${name}`;
    if (this.metrics.has(fullName)) {
      return this.metrics.get(fullName) as Counter;
    }
    const counter = new Counter({
      name: fullName,
      help,
      labelNames,
      registers: [this.registry],
    });
    this.metrics.set(fullName, counter);
    return counter;
  }

  // Gauge - can go up and down
  createGauge(name: string, help: string, labelNames: string[] = []): Gauge {
    const fullName = `${this.config.prefix}${name}`;
    if (this.metrics.has(fullName)) {
      return this.metrics.get(fullName) as Gauge;
    }
    const gauge = new Gauge({
      name: fullName,
      help,
      labelNames,
      registers: [this.registry],
    });
    this.metrics.set(fullName, gauge);
    return gauge;
  }

  // Histogram - samples observations in buckets
  createHistogram(name: string, help: string, labelNames: string[] = [], buckets?: number[]): Histogram {
    const fullName = `${this.config.prefix}${name}`;
    if (this.metrics.has(fullName)) {
      return this.metrics.get(fullName) as Histogram;
    }
    const histogram = new Histogram({
      name: fullName,
      help,
      labelNames,
      buckets: buckets ?? [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    this.metrics.set(fullName, histogram);
    return histogram;
  }

  // Summary - calculates quantiles
  createSummary(name: string, help: string, labelNames: string[] = [], percentiles: number[] = [0.5, 0.9, 0.99]): Summary {
    const fullName = `${this.config.prefix}${name}`;
    if (this.metrics.has(fullName)) {
      return this.metrics.get(fullName) as Summary;
    }
    const summary = new Summary({
      name: fullName,
      help,
      labelNames,
      percentiles,
      registers: [this.registry],
    });
    this.metrics.set(fullName, summary);
    return summary;
  }

  // Get or create metrics
  getCounter(name: string): Counter | undefined {
    return this.metrics.get(`${this.config.prefix}${name}`) as Counter | undefined;
  }

  getGauge(name: string): Gauge | undefined {
    return this.metrics.get(`${this.config.prefix}${name}`) as Gauge | undefined;
  }

  getHistogram(name: string): Histogram | undefined {
    return this.metrics.get(`${this.config.prefix}${name}`) as Histogram | undefined;
  }

  getSummary(name: string): Summary | undefined {
    return this.metrics.get(`${this.config.prefix}${name}`) as Summary | undefined;
  }

  // Remove a metric
  removeMetric(name: string): void {
    const fullName = `${this.config.prefix}${name}`;
    const metric = this.metrics.get(fullName);
    if (metric) {
      this.registry.removeSingleMetric(fullName);
      this.metrics.delete(fullName);
    }
  }

  // Get all metrics as string (for /metrics endpoint)
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  // Get metrics as JSON
  async getMetricsAsJSON(): Promise<any> {
    return this.registry.getMetricsAsJSON();
  }

  // Get content type for Prometheus
  getContentType(): string {
    return this.registry.contentType;
  }
}

// Pre-defined metric factories for common use cases
export const metrics = MetricsManager.getInstance();

// Discord-specific metrics
export const discordMetrics = {
  // Guild metrics
  guildsTotal: metrics.createGauge("guilds_total", "Total number of guilds"),
  guildMembersTotal: metrics.createGauge("guild_members_total", "Total members across all guilds", ["guild_id"]),
  guildChannelsTotal: metrics.createGauge("guild_channels_total", "Total channels in guild", ["guild_id"]),
  guildRolesTotal: metrics.createGauge("guild_roles_total", "Total roles in guild", ["guild_id"]),

  // Message metrics
  messagesReceived: metrics.createCounter("messages_received_total", "Total messages received", ["guild_id", "channel_type"]),
  messagesProcessed: metrics.createCounter("messages_processed_total", "Total messages processed by handlers", ["handler", "result"]),
  commandsExecuted: metrics.createCounter("commands_executed_total", "Total slash commands executed", ["command", "guild_id", "result"]),
  commandsDuration: metrics.createHistogram("commands_duration_seconds", "Command execution duration", ["command"], [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]),

  // Security metrics
  securityEvents: metrics.createCounter("security_events_total", "Total security events", ["event_type", "guild_id", "severity"]),
  rateLimitHits: metrics.createCounter("rate_limit_hits_total", "Total rate limit hits", ["user_id", "endpoint"]),
  tokensBlocked: metrics.createCounter("tokens_blocked_total", "Total tokens blocked by rate limiter", ["reason"]),
  raidDetections: metrics.createCounter("raid_detections_total", "Total raid detections", ["guild_id", "action_taken"]),
  nukeLockdowns: metrics.createCounter("nuke_lockdowns_total", "Total panic lockdowns triggered", ["guild_id", "trigger"]),
  quarantineActions: metrics.createCounter("quarantine_actions_total", "Total quarantine actions", ["action", "guild_id"]),
  sentimentScores: metrics.createHistogram("sentiment_scores", "Server sentiment scores", ["guild_id"]),
  behaviorScores: metrics.createHistogram("behavior_scores", "User behavior risk scores", ["guild_id"]),

  // Token Vault metrics
  tokenVaultOperations: metrics.createCounter("token_vault_operations_total", "Token vault operations", ["operation", "result"]),
  tokenVaultKeyRotations: metrics.createCounter("token_vault_key_rotations_total", "Token vault key rotations"),
  tokenVaultCompromised: metrics.createCounter("token_vault_compromised_total", "Token vault compromise events"),

  // AI metrics
  aiRequests: metrics.createCounter("ai_requests_total", "Total AI API requests", ["provider", "model", "result"]),
  aiRequestDuration: metrics.createHistogram("ai_request_duration_seconds", "AI request duration", ["provider", "model"]),
  aiQuotaExhausted: metrics.createCounter("ai_quota_exhausted_total", "AI quota exhausted events", ["provider"]),
  aiQuotaRemaining: metrics.createGauge("ai_quota_remaining", "AI quota remaining", ["provider"]),

  // Redis metrics
  redisOperations: metrics.createCounter("redis_operations_total", "Redis operations", ["operation", "result"]),
  redisLatency: metrics.createHistogram("redis_latency_seconds", "Redis operation latency", ["operation"]),
  redisConnected: metrics.createGauge("redis_connected", "Redis connection status"),

  // WebSocket metrics
  wsConnections: metrics.createGauge("ws_connections_active", "Active WebSocket connections"),
  wsMessagesSent: metrics.createCounter("ws_messages_sent_total", "WebSocket messages sent", ["type"]),
  wsMessagesReceived: metrics.createCounter("ws_messages_received_total", "WebSocket messages received", ["type"]),
  wsErrors: metrics.createCounter("ws_errors_total", "WebSocket errors", ["error_type"]),

  // HTTP/API metrics
  httpRequests: metrics.createCounter("http_requests_total", "HTTP requests", ["method", "route", "status"]),
  httpRequestDuration: metrics.createHistogram("http_request_duration_seconds", "HTTP request duration", ["method", "route"]),
  httpRequestSize: metrics.createHistogram("http_request_size_bytes", "HTTP request size", ["route"]),
  httpResponseSize: metrics.createHistogram("http_response_size_bytes", "HTTP response size", ["route"]),

  // System metrics
  memoryUsage: metrics.createGauge("memory_usage_bytes", "Process memory usage", ["type"]),
  cpuUsage: metrics.createGauge("cpu_usage_percent", "Process CPU usage"),
  eventLoopLag: metrics.createHistogram("event_loop_lag_seconds", "Event loop lag"),
  activeHandles: metrics.createGauge("active_handles", "Active libuv handles"),
  activeRequests: metrics.createGauge("active_requests", "Active libuv requests"),
};

// Helper function to time an async operation
export async function timeAsync<T>(
  histogram: Histogram,
  labels: Record<string, string>,
  fn: () => Promise<T>
): Promise<T> {
  const end = histogram.startTimer(labels);
  try {
    return await fn();
  } finally {
    end();
  }
}

// Helper function to time a sync operation
export function timeSync<T>(
  histogram: Histogram,
  labels: Record<string, string>,
  fn: () => T
): T {
  const end = histogram.startTimer(labels);
  try {
    return fn();
  } finally {
    end();
  }
}

// Express middleware for HTTP metrics
export function httpMetricsMiddleware() {
  return (req: any, res: any, next: any) => {
    const start = process.hrtime.bigint();
    const route = req.route?.path ?? req.path ?? "unknown";
    
    res.on("finish", () => {
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      discordMetrics.httpRequests.inc({ method: req.method, route, status: res.statusCode.toString() });
      discordMetrics.httpRequestDuration.observe({ method: req.method, route }, duration);
      
      if (req.headers["content-length"]) {
        discordMetrics.httpRequestSize.observe({ route }, parseInt(req.headers["content-length"]));
      }
      if (res.getHeader("content-length")) {
        discordMetrics.httpResponseSize.observe({ route }, parseInt(res.getHeader("content-length") as string));
      }
    });
    
    next();
  };
}

// Export static methods for server.ts
export const getMetrics = () => MetricsManager.getMetrics();
export const getContentType = () => MetricsManager.getContentType();