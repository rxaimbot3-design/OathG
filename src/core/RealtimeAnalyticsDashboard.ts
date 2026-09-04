import { EventEmitter } from "events";
import { log, createModuleLogger } from "../logging/logger.js";

const logger = createModuleLogger("RealtimeAnalyticsDashboard");

export interface DashboardConfig {
  port: number;
  path: string;
  authEnabled: boolean;
  authToken?: string;
  rateLimit: { windowMs: number; maxRequests: number };
  corsOrigins: string[];
  updateInterval: number;
  maxHistoryPoints: number;
  enableWebSocket: boolean;
  wsPath: string;
}

export interface MetricDataPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface MetricSeries {
  name: string;
  type: "counter" | "gauge" | "histogram" | "summary";
  description: string;
  unit: string;
  data: MetricDataPoint[];
  labels: Record<string, string>;
}

export interface DashboardWidget {
  id: string;
  type: "line" | "bar" | "pie" | "gauge" | "table" | "metric" | "alert" | "log" | "custom";
  title: string;
  position: { x: number; y: number; w: number; h: number };
  config: {
    metrics: string[];
    timeRange: number;
    refreshInterval: number;
    visualization: Record<string, any>;
    filters?: Record<string, any>;
    thresholds?: Array<{ value: number; color: string; label: string }>;
  };
  data?: any;
}

export interface DashboardLayout {
  id: string;
  name: string;
  description: string;
  widgets: DashboardWidget[];
  createdAt: number;
  updatedAt: number;
  isDefault: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: "gt" | "lt" | "eq" | "gte" | "lte" | "change";
  threshold: number;
  window: number;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  cooldown: number;
  notifications: AlertNotification[];
}

export interface AlertNotification {
  type: "webhook" | "email" | "discord" | "slack" | "pagerduty";
  config: Record<string, any>;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  value: number;
  threshold: number;
  severity: "info" | "warning" | "critical";
  status: "firing" | "resolved" | "acknowledged";
  startedAt: number;
  resolvedAt?: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
  annotations: Record<string, string>;
}

export interface SystemHealth {
  overall: "healthy" | "degraded" | "critical" | "unknown";
  components: Array<{
    name: string;
    status: "healthy" | "degraded" | "critical" | "unknown";
    latency: number;
    uptime: number;
    lastCheck: number;
    details?: Record<string, any>;
  }>;
  lastUpdated: number;
}

interface DashboardEvents {
  widgetAdded: [DashboardWidget];
  widgetRemoved: [string];
  widgetUpdated: [DashboardWidget];
  layoutSaved: [DashboardLayout];
  layoutDeleted: [string];
  alertRuleAdded: [AlertRule];
  alertRuleRemoved: [string];
  alertRuleUpdated: [AlertRule];
  alertFired: [Alert];
  alertResolved: [Alert];
  alertAcknowledged: [Alert];
  notification: [{ notification: AlertNotification; alert: Alert; rule: AlertRule }];
}

export class RealtimeAnalyticsDashboard extends EventEmitter<DashboardEvents> {
  private static instance: RealtimeAnalyticsDashboard;
  
  private config: DashboardConfig = {
    port: 3001,
    path: "/dashboard",
    authEnabled: true,
    rateLimit: { windowMs: 60000, maxRequests: 1000 },
    corsOrigins: ["*"],
    updateInterval: 5000,
    maxHistoryPoints: 1000,
    enableWebSocket: true,
    wsPath: "/ws"
  };
  
  private metrics = new Map<string, MetricSeries>();
  private widgets = new Map<string, DashboardWidget>();
  private layouts = new Map<string, DashboardLayout>();
  private alertRules = new Map<string, AlertRule>();
  private activeAlerts = new Map<string, Alert>();
  private alertHistory: Alert[] = [];
  private wsConnections = new Set<any>();
  private httpServer: any = null;
  private wsServer: any = null;
  private updateInterval: NodeJS.Timeout | null = null;
  private dataCollectors: Array<() => Promise<Record<string, number>>> = [];
  
  private constructor() {
    super();
    this.initializeDefaultMetrics();
    this.initializeDefaultLayouts();
    this.initializeDefaultAlerts();
  }
  
  static getInstance(): RealtimeAnalyticsDashboard {
    if (!RealtimeAnalyticsDashboard.instance) {
      RealtimeAnalyticsDashboard.instance = new RealtimeAnalyticsDashboard();
    }
    return RealtimeAnalyticsDashboard.instance;
  }
  
  configure(config: Partial<DashboardConfig>) {
    this.config = { ...this.config, ...config };
    log.info({ module: "RealtimeAnalyticsDashboard" }, "Dashboard configured", { config: this.config });
  }
  
  private initializeDefaultMetrics() {
    const defaultMetrics: MetricSeries[] = [
      { name: "bot_latency", type: "gauge", description: "Discord gateway latency", unit: "ms", data: [], labels: {} },
      { name: "bot_uptime", type: "gauge", description: "Bot uptime", unit: "seconds", data: [], labels: {} },
      { name: "guilds_count", type: "gauge", description: "Number of guilds", unit: "count", data: [], labels: {} },
      { name: "users_count", type: "gauge", description: "Total users", unit: "count", data: [], labels: {} },
      { name: "messages_processed", type: "counter", description: "Messages processed", unit: "count", data: [], labels: {} },
      { name: "commands_executed", type: "counter", description: "Commands executed", unit: "count", data: [], labels: {} },
      { name: "events_processed", type: "counter", description: "Events processed", unit: "count", data: [], labels: {} },
      { name: "security_blocks", type: "counter", description: "Security blocks", unit: "count", data: [], labels: {} },
      { name: "memory_usage", type: "gauge", description: "Memory usage", unit: "MB", data: [], labels: {} },
      { name: "cpu_usage", type: "gauge", description: "CPU usage", unit: "percent", data: [], labels: {} },
      { name: "cache_hit_rate", type: "gauge", description: "Cache hit rate", unit: "percent", data: [], labels: {} },
      { name: "rate_limit_hits", type: "counter", description: "Rate limit hits", unit: "count", data: [], labels: {} },
      { name: "anomaly_detections", type: "counter", description: "Anomaly detections", unit: "count", data: [], labels: {} },
      { name: "nuke_attempts_blocked", type: "counter", description: "Nuke attempts blocked", unit: "count", data: [], labels: {} },
      { name: "raid_attempts_blocked", type: "counter", description: "Raid attempts blocked", unit: "count", data: [], labels: {} },
      { name: "voice_sessions_active", type: "gauge", description: "Active voice sessions", unit: "count", data: [], labels: {} },
      { name: "plugin_count", type: "gauge", description: "Loaded plugins", unit: "count", data: [], labels: {} },
      { name: "webhook_requests", type: "counter", description: "Webhook requests", unit: "count", data: [], labels: {} },
      { name: "api_requests", type: "counter", description: "API requests", unit: "count", data: [], labels: {} },
      { name: "error_rate", type: "gauge", description: "Error rate", unit: "percent", data: [], labels: {} }
    ];
    
    for (const metric of defaultMetrics) {
      this.metrics.set(metric.name, metric);
    }
  }
  
  private initializeDefaultLayouts() {
    const defaultLayout: DashboardLayout = {
      id: "default",
      name: "Default Overview",
      description: "Default system overview dashboard",
      widgets: [
        { id: "latency", type: "line", title: "Bot Latency", position: { x: 0, y: 0, w: 6, h: 4 }, config: { metrics: ["bot_latency"], timeRange: 3600000, refreshInterval: 5000, visualization: { color: "#3b82f6" } } },
        { id: "memory", type: "gauge", title: "Memory Usage", position: { x: 6, y: 0, w: 3, h: 4 }, config: { metrics: ["memory_usage"], timeRange: 3600000, refreshInterval: 5000, visualization: { min: 0, max: 2048, thresholds: [{ value: 1024, color: "#f59e0b", label: "Warning" }, { value: 1536, color: "#ef4444", label: "Critical" }] } } },
        { id: "cpu", type: "gauge", title: "CPU Usage", position: { x: 9, y: 0, w: 3, h: 4 }, config: { metrics: ["cpu_usage"], timeRange: 3600000, refreshInterval: 5000, visualization: { min: 0, max: 100, thresholds: [{ value: 70, color: "#f59e0b", label: "Warning" }, { value: 90, color: "#ef4444", label: "Critical" }] } } },
        { id: "guilds", type: "metric", title: "Guilds", position: { x: 12, y: 0, w: 3, h: 4 }, config: { metrics: ["guilds_count"], timeRange: 3600000, refreshInterval: 30000, visualization: {} } },
        { id: "users", type: "metric", title: "Users", position: { x: 15, y: 0, w: 3, h: 4 }, config: { metrics: ["users_count"], timeRange: 3600000, refreshInterval: 30000, visualization: {} } },
        { id: "messages", type: "line", title: "Messages Processed", position: { x: 0, y: 4, w: 6, h: 4 }, config: { metrics: ["messages_processed"], timeRange: 3600000, refreshInterval: 5000, visualization: { color: "#10b981" } } },
        { id: "commands", type: "line", title: "Commands Executed", position: { x: 6, y: 4, w: 6, h: 4 }, config: { metrics: ["commands_executed"], timeRange: 3600000, refreshInterval: 5000, visualization: { color: "#8b5cf6" } } },
        { id: "security", type: "line", title: "Security Blocks", position: { x: 12, y: 4, w: 6, h: 4 }, config: { metrics: ["security_blocks"], timeRange: 3600000, refreshInterval: 5000, visualization: { color: "#ef4444" } } },
        { id: "anomalies", type: "bar", title: "Anomaly Detections", position: { x: 0, y: 8, w: 6, h: 4 }, config: { metrics: ["anomaly_detections"], timeRange: 3600000, refreshInterval: 5000, visualization: { color: "#f59e0b" } } },
        { id: "nuke", type: "metric", title: "Nukes Blocked", position: { x: 6, y: 8, w: 6, h: 4 }, config: { metrics: ["nuke_attempts_blocked"], timeRange: 86400000, refreshInterval: 60000, visualization: {} } },
        { id: "raid", type: "metric", title: "Raids Blocked", position: { x: 12, y: 8, w: 6, h: 4 }, config: { metrics: ["raid_attempts_blocked"], timeRange: 86400000, refreshInterval: 60000, visualization: {} } },
        { id: "cache", type: "gauge", title: "Cache Hit Rate", position: { x: 0, y: 12, w: 3, h: 4 }, config: { metrics: ["cache_hit_rate"], timeRange: 3600000, refreshInterval: 5000, visualization: { min: 0, max: 100, thresholds: [{ value: 80, color: "#10b981", label: "Good" }, { value: 50, color: "#f59e0b", label: "Warning" }] } } },
        { id: "errors", type: "line", title: "Error Rate", position: { x: 3, y: 12, w: 6, h: 4 }, config: { metrics: ["error_rate"], timeRange: 3600000, refreshInterval: 5000, visualization: { color: "#ef4444" } } },
        { id: "voice", type: "metric", title: "Voice Sessions", position: { x: 9, y: 12, w: 3, h: 4 }, config: { metrics: ["voice_sessions_active"], timeRange: 3600000, refreshInterval: 5000, visualization: {} } },
        { id: "plugins", type: "metric", title: "Plugins", position: { x: 12, y: 12, w: 3, h: 4 }, config: { metrics: ["plugin_count"], timeRange: 3600000, refreshInterval: 60000, visualization: {} } }
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDefault: true
    };
    
    this.layouts.set(defaultLayout.id, defaultLayout);
    for (const widget of defaultLayout.widgets) {
      this.widgets.set(widget.id, widget);
    }
  }
  
  private initializeDefaultAlerts() {
    const defaultAlerts: AlertRule[] = [
      { id: "high_latency", name: "High Bot Latency", metric: "bot_latency", condition: "gt", threshold: 200, window: 60000, severity: "warning", enabled: true, cooldown: 300000, notifications: [{ type: "discord", config: { channel: "alerts" } }] },
      { id: "critical_latency", name: "Critical Bot Latency", metric: "bot_latency", condition: "gt", threshold: 500, window: 30000, severity: "critical", enabled: true, cooldown: 60000, notifications: [{ type: "discord", config: { channel: "alerts" } }, { type: "webhook", config: { url: "" } }] },
      { id: "high_memory", name: "High Memory Usage", metric: "memory_usage", condition: "gt", threshold: 1536, window: 120000, severity: "warning", enabled: true, cooldown: 600000, notifications: [{ type: "discord", config: { channel: "alerts" } }] },
      { id: "critical_memory", name: "Critical Memory Usage", metric: "memory_usage", condition: "gt", threshold: 1800, window: 60000, severity: "critical", enabled: true, cooldown: 300000, notifications: [{ type: "discord", config: { channel: "alerts" } }] },
      { id: "high_cpu", name: "High CPU Usage", metric: "cpu_usage", condition: "gt", threshold: 80, window: 120000, severity: "warning", enabled: true, cooldown: 600000, notifications: [] },
      { id: "low_cache", name: "Low Cache Hit Rate", metric: "cache_hit_rate", condition: "lt", threshold: 50, window: 300000, severity: "warning", enabled: true, cooldown: 900000, notifications: [] },
      { id: "high_errors", name: "High Error Rate", metric: "error_rate", condition: "gt", threshold: 5, window: 60000, severity: "critical", enabled: true, cooldown: 300000, notifications: [{ type: "discord", config: { channel: "alerts" } }] },
      { id: "security_spike", name: "Security Block Spike", metric: "security_blocks", condition: "change", threshold: 10, window: 60000, severity: "warning", enabled: true, cooldown: 300000, notifications: [{ type: "discord", config: { channel: "security" } }] }
    ];
    
    for (const alert of defaultAlerts) {
      this.alertRules.set(alert.id, alert);
    }
  }
  
  registerDataCollector(collector: () => Promise<Record<string, number>>) {
    this.dataCollectors.push(collector);
  }
  
  async start() {
    if (this.httpServer) return;
    
    this.startPeriodicCollection();
    
    log.info({ module: "RealtimeAnalyticsDashboard" }, "RealtimeAnalyticsDashboard started", { 
      updateInterval: this.config.updateInterval,
      metricsCount: this.metrics.size,
      widgetsCount: this.widgets.size
    });
  }
  
  private startPeriodicCollection() {
    this.updateInterval = setInterval(async () => {
      await this.collectMetrics();
      this.checkAlerts();
      this.broadcastUpdate();
    }, this.config.updateInterval);
  }
  
  private async collectMetrics() {
    const timestamp = Date.now();
    const collected: Record<string, number> = {};
    
    for (const collector of this.dataCollectors) {
      try {
        const data = await collector();
        Object.assign(collected, data);
      } catch (err) {
        log.debug({ module: "RealtimeAnalyticsDashboard" }, "Data collector error", { error: err });
      }
    }
    
    for (const [name, value] of Object.entries(collected)) {
      this.recordMetric(name, value, timestamp);
    }
    
    this.recordMetric("bot_uptime", Math.floor((Date.now() - (global as any).__startTime || Date.now()) / 1000), timestamp);
  }
  
  recordMetric(name: string, value: number, timestamp: number = Date.now(), labels: Record<string, string> = {}) {
    const metric = this.metrics.get(name);
    if (!metric) {
      this.metrics.set(name, {
        name,
        type: "gauge",
        description: "",
        unit: "",
        data: [{ timestamp, value, labels }],
        labels
      });
      return;
    }
    
    metric.data.push({ timestamp, value, labels });
    
    if (metric.data.length > this.config.maxHistoryPoints) {
      metric.data.shift();
    }
  }
  
  recordMetricBatch(metrics: Record<string, number>, timestamp: number = Date.now()) {
    for (const [name, value] of Object.entries(metrics)) {
      this.recordMetric(name, value, timestamp);
    }
  }
  
  getMetric(name: string): MetricSeries | undefined {
    return this.metrics.get(name);
  }
  
  getAllMetrics(): MetricSeries[] {
    return Array.from(this.metrics.values());
  }
  
  getMetricRange(name: string, startTime: number, endTime: number): MetricDataPoint[] {
    const metric = this.metrics.get(name);
    if (!metric) return [];
    return metric.data.filter(d => d.timestamp >= startTime && d.timestamp <= endTime);
  }
  
  addWidget(widget: DashboardWidget) {
    this.widgets.set(widget.id, widget);
    this.emit("widgetAdded", widget);
  }
  
  removeWidget(widgetId: string) {
    this.widgets.delete(widgetId);
    this.emit("widgetRemoved", widgetId);
  }
  
  updateWidget(widgetId: string, updates: Partial<DashboardWidget>) {
    const widget = this.widgets.get(widgetId);
    if (widget) {
      Object.assign(widget, updates);
      this.emit("widgetUpdated", widget);
    }
  }
  
  getWidget(widgetId: string): DashboardWidget | undefined {
    return this.widgets.get(widgetId);
  }
  
  getAllWidgets(): DashboardWidget[] {
    return Array.from(this.widgets.values());
  }
  
  saveLayout(layout: DashboardLayout) {
    layout.updatedAt = Date.now();
    this.layouts.set(layout.id, layout);
    
    for (const widget of layout.widgets) {
      this.widgets.set(widget.id, widget);
    }
    
    this.emit("layoutSaved", layout);
  }
  
  getLayout(layoutId: string): DashboardLayout | undefined {
    return this.layouts.get(layoutId);
  }
  
  getAllLayouts(): DashboardLayout[] {
    return Array.from(this.layouts.values());
  }
  
  deleteLayout(layoutId: string) {
    const layout = this.layouts.get(layoutId);
    if (layout && layout.isDefault) return false;
    this.layouts.delete(layoutId);
    this.emit("layoutDeleted", layoutId);
    return true;
  }
  
  addAlertRule(rule: AlertRule) {
    this.alertRules.set(rule.id, rule);
    this.emit("alertRuleAdded", rule);
  }
  
  removeAlertRule(ruleId: string) {
    this.alertRules.delete(ruleId);
    this.emit("alertRuleRemoved", ruleId);
  }
  
  updateAlertRule(ruleId: string, updates: Partial<AlertRule>) {
    const rule = this.alertRules.get(ruleId);
    if (rule) {
      Object.assign(rule, updates);
      this.emit("alertRuleUpdated", rule);
    }
  }
  
  getAlertRule(ruleId: string): AlertRule | undefined {
    return this.alertRules.get(ruleId);
  }
  
  getAllAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }
  
  private checkAlerts() {
    const now = Date.now();
    
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;
      
      const metric = this.metrics.get(rule.metric);
      if (!metric || metric.data.length === 0) continue;
      
      const recentData = metric.data.filter(d => now - d.timestamp <= rule.window);
      if (recentData.length === 0) continue;
      
      const latestValue = recentData[recentData.length - 1].value;
      let shouldFire = false;
      
      switch (rule.condition) {
        case "gt": shouldFire = latestValue > rule.threshold; break;
        case "lt": shouldFire = latestValue < rule.threshold; break;
        case "gte": shouldFire = latestValue >= rule.threshold; break;
        case "lte": shouldFire = latestValue <= rule.threshold; break;
        case "eq": shouldFire = latestValue === rule.threshold; break;
        case "change": {
          const oldestValue = recentData[0].value;
          const change = Math.abs(latestValue - oldestValue);
          shouldFire = change > rule.threshold;
          break;
        }
      }
      
      const existingAlert = this.activeAlerts.get(rule.id);
      
      if (shouldFire && !existingAlert) {
        const alert: Alert = {
          id: `alert_${rule.id}_${now}`,
          ruleId: rule.id,
          ruleName: rule.name,
          metric: rule.metric,
          value: latestValue,
          threshold: rule.threshold,
          severity: rule.severity,
          status: "firing",
          startedAt: now,
          annotations: { metric: rule.metric, condition: rule.condition }
        };
        
        this.activeAlerts.set(rule.id, alert);
        this.alertHistory.unshift(alert);
        if (this.alertHistory.length > 1000) this.alertHistory.pop();
        
        this.emit("alertFired", alert);
        this.sendNotifications(rule, alert);
        log.warn({ module: "RealtimeAnalyticsDashboard" }, "Alert fired", { alertId: alert.id, ruleName: rule.name, value: latestValue });
        
      } else if (!shouldFire && existingAlert) {
        existingAlert.status = "resolved";
        existingAlert.resolvedAt = now;
        this.activeAlerts.delete(rule.id);
        this.emit("alertResolved", existingAlert);
        log.info({ module: "RealtimeAnalyticsDashboard" }, "Alert resolved", { alertId: existingAlert.id, ruleName: rule.name });
      }
    }
  }
  
  private sendNotifications(rule: AlertRule, alert: Alert) {
    for (const notification of rule.notifications) {
      this.emit("notification", { notification, alert, rule });
    }
  }
  
  getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }
  
  getAlertHistory(limit: number = 100): Alert[] {
    return this.alertHistory.slice(0, limit);
  }
  
  acknowledgeAlert(alertId: string, acknowledgedBy: string) {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.status = "acknowledged";
      alert.acknowledgedAt = Date.now();
      alert.acknowledgedBy = acknowledgedBy;
      this.emit("alertAcknowledged", alert);
    }
  }
  
  getSystemHealth(): SystemHealth {
    const components = [
      { name: "Discord Gateway", status: "healthy" as "healthy" | "degraded" | "critical", latency: 0, uptime: 0, lastCheck: Date.now() },
      { name: "Event Pipeline", status: "healthy" as "healthy" | "degraded" | "critical", latency: 0, uptime: 0, lastCheck: Date.now() },
      { name: "Security Engine", status: "healthy" as "healthy" | "degraded" | "critical", latency: 0, uptime: 0, lastCheck: Date.now() },
      { name: "Cache Layer", status: "healthy" as "healthy" | "degraded" | "critical", latency: 0, uptime: 0, lastCheck: Date.now() },
      { name: "Database", status: "healthy" as "healthy" | "degraded" | "critical", latency: 0, uptime: 0, lastCheck: Date.now() },
      { name: "Voice Engine", status: "healthy" as "healthy" | "degraded" | "critical", latency: 0, uptime: 0, lastCheck: Date.now() }
    ];
    
    const critical = components.filter(c => c.status === "critical").length;
    const degraded = components.filter(c => c.status === "degraded").length;
    
    let overall: SystemHealth["overall"] = "healthy";
    if (critical > 0) overall = "critical";
    else if (degraded > 0) overall = "degraded";
    
    return { overall, components, lastUpdated: Date.now() };
  }
  
  private broadcastUpdate() {
    if (!this.config.enableWebSocket || this.wsConnections.size === 0) return;
    
    const update = {
      type: "metrics_update",
      timestamp: Date.now(),
      metrics: this.getMetricsSummary(),
      alerts: this.getActiveAlerts(),
      health: this.getSystemHealth()
    };
    
    const message = JSON.stringify(update);
    
    for (const ws of this.wsConnections) {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    }
  }
  
  private getMetricsSummary(): Record<string, { current: number; change: number; trend: "up" | "down" | "stable" }> {
    const summary: Record<string, any> = {};
    const now = Date.now();
    const hourAgo = now - 3600000;
    
    for (const [name, metric] of this.metrics.entries()) {
      const recent = metric.data.filter(d => d.timestamp > hourAgo);
      if (recent.length < 2) continue;
      
      const current = recent[recent.length - 1].value;
      const previous = recent[0].value;
      const change = current - previous;
      const trend = change > 0 ? "up" : change < 0 ? "down" : "stable";
      
      summary[name] = { current, change, trend };
    }
    
    return summary;
  }
  
  addWebSocketConnection(ws: any) {
    this.wsConnections.add(ws);
    log.debug({ module: "RealtimeAnalyticsDashboard" }, "WebSocket connection added", { total: this.wsConnections.size });
    
    ws.on("close", () => {
      this.wsConnections.delete(ws);
      log.debug({ module: "RealtimeAnalyticsDashboard" }, "WebSocket connection removed", { total: this.wsConnections.size });
    });
    
    ws.on("error", (err: any) => {
      log.debug({ module: "RealtimeAnalyticsDashboard" }, "WebSocket error", { error: err });
    });
    
    ws.send(JSON.stringify({
      type: "init",
      timestamp: Date.now(),
      metrics: this.getMetricsSummary(),
      alerts: this.getActiveAlerts(),
      health: this.getSystemHealth(),
      layouts: this.getAllLayouts()
    }));
  }
  
  getStats() {
    return {
      metricsCount: this.metrics.size,
      widgetsCount: this.widgets.size,
      layoutsCount: this.layouts.size,
      alertRulesCount: this.alertRules.size,
      activeAlertsCount: this.activeAlerts.size,
      wsConnections: this.wsConnections.size,
      dataCollectors: this.dataCollectors.length
    };
  }
  
  async shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    
    for (const ws of this.wsConnections) {
      ws.close();
    }
    this.wsConnections.clear();
    
    this.metrics.clear();
    this.widgets.clear();
    this.layouts.clear();
    this.alertRules.clear();
    this.activeAlerts.clear();
    this.alertHistory.length = 0;
    this.dataCollectors.length = 0;
    this.removeAllListeners();
    
    log.info({ module: "RealtimeAnalyticsDashboard" }, "RealtimeAnalyticsDashboard shutdown complete");
  }
}

export const realtimeAnalyticsDashboard = RealtimeAnalyticsDashboard.getInstance();