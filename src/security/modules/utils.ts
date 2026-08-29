import fs from "fs";
import crypto from "crypto";
import path from "path";

/**
 * Helper for atomic file writes with file permissions 0600
 */
export function atomicWriteJsonSync(filePath: string, data: any): void {
  const tmpPath = `${filePath}.${crypto.randomBytes(6).toString("hex")}.tmp`;
  try {
    let contentToWrite: string;
    if (typeof data === "string") {
      contentToWrite = data;
    } else {
      contentToWrite = JSON.stringify(data, null, 2);
    }
    const fd = fs.openSync(tmpPath, "w", 0o600);
    fs.writeFileSync(fd, contentToWrite, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fs.renameSync(tmpPath, filePath);
  } catch (err: any) {
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
    console.error(`Error atomically writing to ${filePath}:`, err);
  }
}

/**
 * Memory monitoring for unbounded Maps
 */
const MEMORY_WARN_THRESHOLD = 10000;
const MEMORY_CRITICAL_THRESHOLD = 50000;

export interface MemoryThresholds {
  warnAt?: number;
  criticalAt?: number;
}

export function checkUnboundedMapSize<K, V>(
  name: string, 
  map: Map<K, V>, 
  thresholds: MemoryThresholds = {}
): void {
  const size = map.size;
  const warnAt = thresholds.warnAt ?? MEMORY_WARN_THRESHOLD;
  const criticalAt = thresholds.criticalAt ?? MEMORY_CRITICAL_THRESHOLD;
  
  if (size > criticalAt) {
    console.error(`[MEMORY] CRITICAL: ${name} has ${size} entries (limit: ${criticalAt})`);
  } else if (size > warnAt) {
    console.warn(`[MEMORY] WARNING: ${name} has ${size} entries (warn: ${warnAt})`);
  }
}

export function runMemoryMonitoring(modules: Map<string, Map<any, any>>): void {
  for (const [name, map] of modules) {
    checkUnboundedMapSize(name, map);
  }
}

/**
 * Safe JSON parse with error handling
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Generate secure random string
 */
export function generateSecureRandom(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Timing-safe string comparison
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}