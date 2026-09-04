import cluster from "cluster";
import { EventEmitter } from "events";
import { CppNativeEngine } from "../CppEngine.js";
import { log, createModuleLogger } from "../logging/logger.js";
import { ultraLowLatencyPipeline, PipelineEvent } from "./UltraLowLatencyPipeline.js";

const logger = createModuleLogger("MultiShardCluster");

export interface ShardConfig {
  totalShards: number | "auto";
  shardsPerWorker: number;
  firstShardId?: number;
  lastShardId?: number;
}

export interface WorkerMetrics {
  workerId: number;
  shardIds: number[];
  guildCount: number;
  memberCount: number;
  latency: number;
  memoryUsage: number;
  cpuUsage: number;
  eventsProcessed: number;
  uptime: number;
  status: "starting" | "ready" | "degraded" | "crashed" | "restarting";
}

export interface ClusterMetrics {
  totalWorkers: number;
  healthyWorkers: number;
  totalShards: number;
  totalGuilds: number;
  totalMembers: number;
  avgLatency: number;
  totalEventsProcessed: number;
  uptime: number;
  workers: WorkerMetrics[];
}

interface ClusterEvents {
  metrics: [ClusterMetrics];
  workerEvent: [{ workerId: number; event: PipelineEvent }];
  healthChanged: [{ previous: string; current: string }];
}

export class MultiShardCluster extends EventEmitter {
  private static instance: MultiShardCluster;
  
  private config: ShardConfig;
  private workers = new Map<number, WorkerMetrics>();
  private masterMetrics: ClusterMetrics = {
    totalWorkers: 0,
    healthyWorkers: 0,
    totalShards: 0,
    totalGuilds: 0,
    totalMembers: 0,
    avgLatency: 0,
    totalEventsProcessed: 0,
    uptime: 0,
    workers: []
  };
  
  private startTime = Date.now();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private metricsAggregationInterval: NodeJS.Timeout | null = null;
  private isMaster = false;
  private cppEngine: CppNativeEngine | null = null;
  
  private constructor(config: Partial<ShardConfig> = {}) {
    super();
    const totalShards = config.totalShards === "auto" 
      ? Math.max(1, Math.floor((require("os").cpus().length * 0.75)))
      : (typeof config.totalShards === "number" ? config.totalShards : 1);
    
    this.config = {
      totalShards,
      shardsPerWorker: config.shardsPerWorker || 1,
      firstShardId: config.firstShardId,
      lastShardId: config.lastShardId
    };
    
    this.isMaster = cluster.isPrimary;
    
    if (this.isMaster) {
      this.initializeMaster();
    } else {
      this.initializeWorker();
    }
  }
  
  static getInstance(config?: Partial<ShardConfig>): MultiShardCluster {
    if (!MultiShardCluster.instance) {
      MultiShardCluster.instance = new MultiShardCluster(config);
    }
    return MultiShardCluster.instance;
  }
  
  private initializeMaster() {
    log.info({ module: "MultiShardCluster" }, "🚀 Initializing Multi-Shard Cluster Master", { config: this.config });
    
    const totalShards = typeof this.config.totalShards === "number" 
      ? this.config.totalShards 
      : Math.max(1, Math.floor((require("os").cpus().length * 0.75)));
    
    const workerCount = Math.ceil(totalShards / this.config.shardsPerWorker);
    
    log.info({ module: "MultiShardCluster" }, `Spawning ${workerCount} workers for ${totalShards} shards`);
    
    for (let i = 0; i < workerCount; i++) {
      const firstShard = i * this.config.shardsPerWorker;
      const lastShard = Math.min(firstShard + this.config.shardsPerWorker - 1, totalShards - 1);
      
      const worker = cluster.fork({
        SHARD_IDS: `${firstShard}-${lastShard}`,
        TOTAL_SHARDS: totalShards.toString(),
        WORKER_ID: i.toString(),
        IS_WORKER: "true"
      });
      
      this.setupWorkerListeners(worker, i, Array.from({ length: lastShard - firstShard + 1 }, (_, k) => firstShard + k));
    }
    
    cluster.on("exit", (worker, code, signal) => {
      this.handleWorkerExit(worker, code, signal);
    });
    
    this.startHealthChecks();
    this.startMetricsAggregation();
    
    process.on("SIGTERM", () => this.gracefulShutdown());
    process.on("SIGINT", () => this.gracefulShutdown());
  }
  
  private setupWorkerListeners(worker: any, workerId: number, shardIds: number[]) {
    worker.on("message", (msg: any) => this.handleWorkerMessage(workerId, msg));
    
    this.workers.set(workerId, {
      workerId,
      shardIds,
      guildCount: 0,
      memberCount: 0,
      latency: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      eventsProcessed: 0,
      uptime: 0,
      status: "starting"
    });
  }
  
  private handleWorkerMessage(workerId: number, msg: any) {
    const worker = this.workers.get(workerId);
    if (!worker) return;
    
    switch (msg.type) {
      case "READY":
        worker.status = "ready";
        worker.guildCount = msg.guildCount;
        worker.memberCount = msg.memberCount;
        break;
      case "METRICS":
        worker.latency = msg.latency;
        worker.memoryUsage = msg.memoryUsage;
        worker.cpuUsage = msg.cpuUsage;
        worker.eventsProcessed = msg.eventsProcessed;
        worker.uptime = msg.uptime;
        break;
      case "HEALTH_CHECK":
        worker.status = msg.healthy ? "ready" : "degraded";
        break;
      case "EVENT":
        this.emit("workerEvent", { workerId, event: msg.event });
        break;
    }
    
    this.updateMasterMetrics();
  }
  
  private handleWorkerExit(worker: any, code: number, signal: string) {
    const workerId = parseInt(worker.process.env.WORKER_ID || "-1");
    log.warn({ module: "MultiShardCluster" }, `Worker ${workerId} exited`, { code, signal });
    
    const workerMetrics = this.workers.get(workerId);
    if (workerMetrics) {
      workerMetrics.status = "crashed";
    }
    
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      setTimeout(() => this.respawnWorker(workerId), 5000);
    }
  }
  
  private respawnWorker(workerId: number) {
    const workerMetrics = this.workers.get(workerId);
    if (!workerMetrics) return;
    
    workerMetrics.status = "restarting";
    log.info({ module: "MultiShardCluster" }, `Respawning worker ${workerId} for shards ${workerMetrics.shardIds.join(",")}`);
    
    const worker = cluster.fork({
      SHARD_IDS: `${workerMetrics.shardIds[0]}-${workerMetrics.shardIds[workerMetrics.shardIds.length - 1]}`,
      TOTAL_SHARDS: this.config.totalShards.toString(),
      WORKER_ID: workerId.toString(),
      IS_WORKER: "true"
    });
    
    this.setupWorkerListeners(worker, workerId, workerMetrics.shardIds);
  }
  
  private startHealthChecks() {
    this.healthCheckInterval = setInterval(() => {
      const workers = Object.values(cluster.workers || {}) as any[];
      for (const worker of workers) {
        const wid = parseInt(worker.process?.env?.WORKER_ID || "-1");
        if (wid >= 0) {
          worker.send({ type: "HEALTH_CHECK" });
        }
      }
    }, 30000);
  }
  
  private startMetricsAggregation() {
    this.metricsAggregationInterval = setInterval(() => {
      this.updateMasterMetrics();
      this.emit("metrics", this.getMetrics());
    }, 5000);
  }
  
  private updateMasterMetrics() {
    const workerArray = Array.from(this.workers.values());
    const totalShards = typeof this.config.totalShards === "number" 
      ? this.config.totalShards 
      : workerArray.length * this.config.shardsPerWorker;
    this.masterMetrics = {
      totalWorkers: workerArray.length,
      healthyWorkers: workerArray.filter(w => w.status === "ready").length,
      totalShards,
      totalGuilds: workerArray.reduce((sum, w) => sum + w.guildCount, 0),
      totalMembers: workerArray.reduce((sum, w) => sum + w.memberCount, 0),
      avgLatency: workerArray.length > 0 
        ? workerArray.reduce((sum, w) => sum + w.latency, 0) / workerArray.length 
        : 0,
      totalEventsProcessed: workerArray.reduce((sum, w) => sum + w.eventsProcessed, 0),
      uptime: Date.now() - this.startTime,
      workers: workerArray
    };
  }
  
  private async gracefulShutdown() {
    log.info({ module: "MultiShardCluster" }, "Initiating graceful cluster shutdown...");
    
    if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
    if (this.metricsAggregationInterval) clearInterval(this.metricsAggregationInterval);
    
    const workers = Object.values(cluster.workers || {}) as any[];
    for (const worker of workers) {
      worker.send({ type: "SHUTDOWN" });
      worker.disconnect();
    }
    
    setTimeout(() => {
      for (const worker of workers) {
        worker.kill("SIGKILL");
      }
      process.exit(0);
    }, 10000);
  }
  
  private initializeWorker() {
    log.info({ module: "MultiShardCluster" }, "🔧 Initializing Worker", { 
      workerId: process.env.WORKER_ID,
      shardIds: process.env.SHARD_IDS 
    });
    
    this.initializeCppEngine();
    this.setupMessageHandlers();
    this.startWorkerMetricsReporting();
    
    process.on("SIGTERM", () => process.exit(0));
    process.on("SIGINT", () => process.exit(0));
  }
  
  private async initializeCppEngine() {
    try {
      this.cppEngine = new CppNativeEngine();
      await this.cppEngine.initialize();
      log.info({ module: "MultiShardCluster" }, "✅ C++ Native Engine initialized in worker");
    } catch (err) {
      log.warn({ module: "MultiShardCluster" }, "C++ Engine not available in worker", { error: err });
    }
  }
  
  private setupMessageHandlers() {
    process.on("message", async (msg: any) => {
      switch (msg.type) {
        case "HEALTH_CHECK":
          this.reportHealth();
          break;
        case "SHUTDOWN":
          log.info({ module: "MultiShardCluster" }, "Shutdown signal received");
          process.exit(0);
          break;
        case "BROADCAST":
          this.emit("broadcast", msg.payload);
          break;
      }
    });
  }
  
  private startWorkerMetricsReporting() {
    setInterval(() => {
      this.reportMetrics();
    }, 5000);
  }
  
  private reportMetrics() {
    const pipelineMetrics = ultraLowLatencyPipeline.getMetrics();
    const memUsage = process.memoryUsage();
    
    if (process.send) {
      process.send({
        type: "METRICS",
        latency: pipelineMetrics.avgLatencyMs,
        memoryUsage: memUsage.heapUsed / 1024 / 1024,
        cpuUsage: process.cpuUsage().user / 1000000,
        eventsProcessed: pipelineMetrics.processed,
        uptime: Date.now() - (global as any).__workerStartTime || Date.now(),
        guildCount: (global as any).__guildCount || 0,
        memberCount: (global as any).__memberCount || 0
      });
    }
  }
  
  private reportHealth() {
    const pipelineMetrics = ultraLowLatencyPipeline.getMetrics();
    const healthy = pipelineMetrics.queueDepth < 1000 && pipelineMetrics.avgLatencyMs < 100;
    
    if (process.send) {
      process.send({
        type: "HEALTH_CHECK",
        healthy,
        queueDepth: pipelineMetrics.queueDepth,
        avgLatency: pipelineMetrics.avgLatencyMs
      });
    }
  }
  
  broadcastToWorkers(event: PipelineEvent) {
    if (!this.isMaster) return;
    
    const workers = Object.values(cluster.workers || {}) as any[];
    for (const worker of workers) {
      worker.send({ type: "BROADCAST", payload: event });
    }
  }
  
  getMetrics(): ClusterMetrics {
    return { ...this.masterMetrics };
  }
  
  getWorkerMetrics(workerId: number): WorkerMetrics | undefined {
    return this.workers.get(workerId);
  }
  
  async shutdown() {
    if (this.isMaster) {
      await this.gracefulShutdown();
    }
    if (this.cppEngine) {
      await this.cppEngine.shutdown();
    }
    this.removeAllListeners();
    log.info({ module: "MultiShardCluster" }, "MultiShardCluster shutdown complete");
  }
}

export const multiShardCluster = MultiShardCluster.getInstance();