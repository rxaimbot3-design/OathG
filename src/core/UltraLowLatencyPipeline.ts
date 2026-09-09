import { EventEmitter } from "events";
import { TtlMap } from "../security/MapManager.js";
import { log, createModuleLogger } from "../logging/logger.js";
import { Semaphore } from "./Semaphore.js";
import { CppNativeEngine } from "../CppEngine.js";
import { cpus } from "os";

const logger = createModuleLogger("UltraLowLatencyPipeline");

export interface PipelineEvent {
  id: string;
  type: string;
  guildId: string;
  payload: any;
  priority: "critical" | "high" | "normal" | "low";
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface PipelineMetrics {
  processed: number;
  failed: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  throughputPerSec: number;
  queueDepth: number;
  workerUtilization: number;
  droppedEvents: number;
  backpressureEvents: number;
}

interface LatencyBucket {
  count: number;
  sum: number;
  min: number;
  max: number;
}

interface UltraLowLatencyPipelineEvents {
  processed: [PipelineEvent];
  error: [{ event: PipelineEvent; error: unknown }];
}

export class UltraLowLatencyPipeline extends EventEmitter<UltraLowLatencyPipelineEvents> {
  private static instance: UltraLowLatencyPipeline;
  
  // Queue bounds - prevent unbounded memory growth
  static readonly MAX_QUEUE_SIZE = 10000;
  static readonly MAX_CRITICAL_QUEUE = 1000;
  static readonly MAX_HIGH_QUEUE = 10000;
  static readonly BACKPRESSURE_THRESHOLD = UltraLowLatencyPipeline.MAX_QUEUE_SIZE * 0.8;
  static readonly BACKPRESSURE_RECOVERY = UltraLowLatencyPipeline.MAX_QUEUE_SIZE * 0.5;
  
  private criticalQueue: PipelineEvent[] = [];
  private highQueue: PipelineEvent[] = [];
  private normalQueue: PipelineEvent[] = [];
  private lowQueue: PipelineEvent[] = [];
  
  private processing = false;
  private shuttingDown = false;
  private activeWorkers = 0;
  private semaphore: Semaphore;
  private metricsInterval: NodeJS.Timeout | null = null;
  private maxWorkers = cpus().length || 8;
  
  // Backpressure state
  private backpressureActive = false;
  
private metrics: PipelineMetrics = {
    processed: 0,
    failed: 0,
    avgLatencyMs: 0,
    p50LatencyMs: 0,
    p95LatencyMs: 0,
    p99LatencyMs: 0,
    throughputPerSec: 0,
    queueDepth: 0,
    workerUtilization: 0,
    droppedEvents: 0,
    backpressureEvents: 0
  };
  
  private latencyBuckets = new Map<string, LatencyBucket>();
  private latencyHistory: number[] = [];
  private readonly MAX_HISTORY = 10000;
  
  private throughputWindow: number[] = [];
  private lastThroughputCalc = Date.now();
  
  private cppEngine: CppNativeEngine | null = null;
  private useCppAcceleration = false;
  
  private eventHandlers = new Map<string, (event: PipelineEvent) => Promise<void>>();
  private globalMiddleware: Array<(event: PipelineEvent) => Promise<PipelineEvent | null>> = [];
  
  private constructor() {
    super();
    this.semaphore = new Semaphore(this.maxWorkers);
    this.initializeCppEngine();
    this.startProcessingLoop();
    this.startMetricsCollection();
  }
  
  static getInstance(): UltraLowLatencyPipeline {
    if (!UltraLowLatencyPipeline.instance) {
      UltraLowLatencyPipeline.instance = new UltraLowLatencyPipeline();
    }
    return UltraLowLatencyPipeline.instance;
  }
  
  private async initializeCppEngine() {
    try {
      this.cppEngine = new CppNativeEngine();
      await this.cppEngine.initialize();
      this.useCppAcceleration = true;
      log.info({ module: "UltraLowLatencyPipeline" }, "✅ C++ Native Engine initialized for ultra-low latency processing");
    } catch (err) {
      log.warn({ module: "UltraLowLatencyPipeline" }, "C++ Engine not available, using JS fallback", { error: err });
      this.useCppAcceleration = false;
    }
  }
  
  registerHandler(eventType: string, handler: (event: PipelineEvent) => Promise<void>) {
    this.eventHandlers.set(eventType, handler);
  }
  
  addGlobalMiddleware(middleware: (event: PipelineEvent) => Promise<PipelineEvent | null>) {
    this.globalMiddleware.push(middleware);
  }
  
  async enqueue(event: Omit<PipelineEvent, "id" | "timestamp">): Promise<string> {
    // Check backpressure before enqueueing
    const totalDepth = this.criticalQueue.length + this.highQueue.length + this.normalQueue.length + this.lowQueue.length;
    
    // GLOBAL CAP: Always enforce MAX_QUEUE_SIZE FIRST - no priority can exceed global maximum
    if (totalDepth >= UltraLowLatencyPipeline.MAX_QUEUE_SIZE) {
      this.metrics.droppedEvents++;
      this.backpressureActive = true;
      throw new Error(`GLOBAL CAP EXCEEDED: Queue full (${totalDepth}/${UltraLowLatencyPipeline.MAX_QUEUE_SIZE}), dropping ${event.priority} event`);
    }
    
    // Per-priority bounds (WITHIN global cap)
    if (event.priority === "critical" && this.criticalQueue.length >= UltraLowLatencyPipeline.MAX_CRITICAL_QUEUE) {
      this.metrics.droppedEvents++;
      throw new Error(`CRITICAL QUEUE FULL: Max ${UltraLowLatencyPipeline.MAX_CRITICAL_QUEUE} critical events`);
    }
    
    if (event.priority === "high" && this.highQueue.length >= UltraLowLatencyPipeline.MAX_HIGH_QUEUE) {
      this.metrics.droppedEvents++;
      throw new Error(`HIGH QUEUE FULL: Max ${UltraLowLatencyPipeline.MAX_HIGH_QUEUE} high-priority events`);
    }
    
    // Recovery from backpressure
    if (this.backpressureActive && totalDepth < UltraLowLatencyPipeline.BACKPRESSURE_RECOVERY) {
      this.backpressureActive = false;
    }

    const id = crypto.randomUUID();
    const pipelineEvent: PipelineEvent = {
      ...event,
      id,
      timestamp: Date.now()
    };
    
    switch (event.priority) {
      case "critical":
        this.criticalQueue.unshift(pipelineEvent);
        break;
      case "high":
        this.highQueue.unshift(pipelineEvent);
        break;
      case "normal":
        this.normalQueue.push(pipelineEvent);
        break;
      case "low":
        this.lowQueue.push(pipelineEvent);
        break;
    }
    
    this.updateQueueDepth();
    return id;
  }
  
  async enqueueBatch(events: Omit<PipelineEvent, "id" | "timestamp">[]): Promise<string[]> {
    const ids: string[] = [];
    for (const event of events) {
      ids.push(await this.enqueue(event));
    }
    return ids;
  }
  
  private startProcessingLoop() {
    setImmediate(() => this.processLoop());
  }
  
  private async processLoop() {
    if (this.processing) return;
    this.processing = true;
    
    while (!this.shuttingDown) {
      const event = this.dequeueNext();
      if (!event) {
        this.processing = false;
        await new Promise(resolve => setTimeout(resolve, 1));
        if (this.shuttingDown) break;
        this.processing = true;
        continue;
      }
      
      // Use semaphore for proper concurrency control
      await this.semaphore.acquire();
      this.activeWorkers++;
      this.processEvent(event).finally(() => {
        this.semaphore.release();
        this.activeWorkers--;
      });
    }
    
    this.processing = false;
  }
  
  private dequeueNext(): PipelineEvent | null {
    if (this.criticalQueue.length) return this.criticalQueue.pop()!;
    if (this.highQueue.length) return this.highQueue.pop()!;
    if (this.normalQueue.length) return this.normalQueue.shift()!;
    if (this.lowQueue.length) return this.lowQueue.shift()!;
    return null;
  }
  
  private async processEvent(event: PipelineEvent) {
    const startTime = performance.now();
    
    try {
      let processedEvent = event;
      
      for (const middleware of this.globalMiddleware) {
        const result = await middleware(processedEvent);
        if (result === null) {
          return;
        }
        processedEvent = result;
      }
      
      const handler = this.eventHandlers.get(processedEvent.type);
      if (handler) {
        // C++ acceleration: use for fast risk scoring, but ALWAYS call JS handler for enforcement
        let cppResult: { score?: number; decision?: string; rule?: string } | null = null;
        
        if (this.useCppAcceleration && this.cppEngine && this.isCppCompatible(processedEvent)) {
          try {
            cppResult = await this.cppEngine.processEvent(processedEvent);
            // Attach C++ risk score to event for JS handler to use
            if (cppResult && typeof cppResult.score === "number") {
              (processedEvent as any).cppRiskScore = cppResult.score;
              (processedEvent as any).cppDecision = cppResult.decision;
              (processedEvent as any).cppRule = cppResult.rule;
            }
          } catch (cppErr) {
            // C++ engine failed - log but don't block, fall back to JS handler
            log.warn({ module: "UltraLowLatencyPipeline" }, "C++ engine error, falling back to JS handler", { 
              eventId: processedEvent.id, 
              type: processedEvent.type, 
              error: cppErr 
            });
          }
        }
        
        // ALWAYS call JS handler for actual enforcement actions
        // JS handler can access (event as any).cppRiskScore for C++ risk score
        await handler(processedEvent);
      }
      
      this.emit("processed", processedEvent);
      
    } catch (err) {
      this.metrics.failed++;
      this.emit("error", { event, error: err });
      log.error({ module: "UltraLowLatencyPipeline" }, "Pipeline event processing failed", { eventId: event.id, type: event.type, error: err });
    } finally {
      const latency = performance.now() - startTime;
      this.recordLatency(event.type, latency);
      this.metrics.processed++;
    }
  }
  
  private isCppCompatible(event: PipelineEvent): boolean {
    return ["guildBanAdd", "guildMemberAdd", "channelDelete", "roleDelete", "guildMemberRemove"].includes(event.type);
  }
  
  private recordLatency(eventType: string, latencyMs: number) {
    this.latencyHistory.push(latencyMs);
    if (this.latencyHistory.length > this.MAX_HISTORY) {
      this.latencyHistory.shift();
    }
    
    let bucket = this.latencyBuckets.get(eventType);
    if (!bucket) {
      bucket = { count: 0, sum: 0, min: Infinity, max: -Infinity };
      this.latencyBuckets.set(eventType, bucket);
    }
    bucket.count++;
    bucket.sum += latencyMs;
    bucket.min = Math.min(bucket.min, latencyMs);
    bucket.max = Math.max(bucket.max, latencyMs);
  }
  
  private startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      if (!this.shuttingDown) {
        this.calculateMetrics();
      }
    }, 1000);
  }
  
  private calculateMetrics() {
    const now = Date.now();
    const windowSec = (now - this.lastThroughputCalc) / 1000;
    this.throughputWindow.push(this.metrics.processed);
    if (this.throughputWindow.length > 60) this.throughputWindow.shift();
    
    this.metrics.throughputPerSec = this.throughputWindow.reduce((a, b) => a + b, 0) / Math.max(1, this.throughputWindow.length);
    this.lastThroughputCalc = now;
    
    if (this.latencyHistory.length > 0) {
      const sorted = [...this.latencyHistory].sort((a, b) => a - b);
      this.metrics.avgLatencyMs = sorted.reduce((a, b) => a + b, 0) / sorted.length;
      this.metrics.p50LatencyMs = sorted[Math.floor(sorted.length * 0.5)];
      this.metrics.p95LatencyMs = sorted[Math.floor(sorted.length * 0.95)];
      this.metrics.p99LatencyMs = sorted[Math.floor(sorted.length * 0.99)];
    }
    
    this.metrics.queueDepth = this.criticalQueue.length + this.highQueue.length + this.normalQueue.length + this.lowQueue.length;
    this.metrics.workerUtilization = Math.min(1, this.activeWorkers / this.maxWorkers);
  }
  
  private updateQueueDepth() {
    this.metrics.queueDepth = this.criticalQueue.length + this.highQueue.length + this.normalQueue.length + this.lowQueue.length;
  }
  
  getMetrics(): PipelineMetrics {
    return { ...this.metrics };
  }
  
  getLatencyBreakdown(): Record<string, LatencyBucket> {
    const result: Record<string, LatencyBucket> = {};
    for (const [type, bucket] of this.latencyBuckets) {
      result[type] = { ...bucket };
    }
    return result;
  }
  
  async shutdown() {
    this.shuttingDown = true;
    
    // Clear metrics interval
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    // Wait for processing to complete (with timeout)
    const startWait = Date.now();
    const maxWaitMs = 5000;
    while ((this.processing || this.activeWorkers > 0) && Date.now() - startWait < maxWaitMs) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    this.removeAllListeners();
    this.eventHandlers.clear();
    this.globalMiddleware.length = 0;
    if (this.cppEngine) {
      await this.cppEngine.shutdown();
    }
    log.info({ module: "UltraLowLatencyPipeline" }, "UltraLowLatencyPipeline shutdown complete");
  }
}

export const ultraLowLatencyPipeline = UltraLowLatencyPipeline.getInstance();