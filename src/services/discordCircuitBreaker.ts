/**
 * Discord REST Circuit Breaker
 * Prevents retry storms when Discord API is rate-limited or unavailable
 */

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerConfig {
  failureThreshold?: number;      // Failures before opening
  successThreshold?: number;      // Successes in half-open before closing
  timeout?: number;               // Time in ms before trying half-open
  excludedStatusCodes?: number[]; // Status codes that don't count as failures
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  nextAttempt: number | null;
}

const DEFAULT_CONFIG: Required<CircuitBreakerConfig> = {
  failureThreshold: 5,
  successThreshold: 3,
  timeout: 30000, // 30 seconds
  excludedStatusCodes: [400, 401, 403, 404], // Client errors don't indicate service failure
};

export class DiscordRestCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private nextAttempt: number | null = null;
  private readonly config: Required<CircuitBreakerConfig>;

  static getInstance(config?: CircuitBreakerConfig): DiscordRestCircuitBreaker {
    return getDiscordRestCircuitBreaker(config);
  }

  constructor(config: CircuitBreakerConfig = {}) {
    this.config = {
      failureThreshold: config.failureThreshold ?? DEFAULT_CONFIG.failureThreshold,
      successThreshold: config.successThreshold ?? DEFAULT_CONFIG.successThreshold,
      timeout: config.timeout ?? DEFAULT_CONFIG.timeout,
      excludedStatusCodes: config.excludedStatusCodes ?? DEFAULT_CONFIG.excludedStatusCodes,
    };
  }

  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === CircuitState.OPEN && this.nextAttempt && Date.now() >= this.nextAttempt) {
      this.state = CircuitState.HALF_OPEN;
      this.successes = 0;
    }
    return this.state;
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.getState(),
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      nextAttempt: this.nextAttempt,
    };
  }

  isAvailable(): boolean {
    return this.getState() !== CircuitState.OPEN;
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.isAvailable()) {
      const metrics = this.getMetrics();
      const waitTime = metrics.nextAttempt ? metrics.nextAttempt - Date.now() : 0;
      throw new Error(`CIRCUIT_BREAKER_OPEN: Discord REST unavailable, retry in ${Math.ceil(waitTime / 1000)}s`);
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error: any) {
      this.onFailure(error);
      throw error;
    }
  }

  public onSuccess(): void {
    this.failures = 0;
    this.lastSuccess = Date.now();
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.successes = 0;
      }
    }
  }

  public onFailure(error: any): void {
    // Check if this is a client error that shouldn't count
    const status = error?.status || error?.response?.status || error?.statusCode;
    if (status && this.config.excludedStatusCodes!.includes(status)) {
      // Client error (400, 401, 403, 404) - don't count as circuit breaker failure
      return;
    }

    this.failures++;
    this.lastFailure = Date.now();
    this.successes = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open goes back to open
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
    } else if (this.state === CircuitState.CLOSED && this.failures >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.config.timeout;
    }
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
    this.lastSuccess = null;
    this.nextAttempt = null;
  }

  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.nextAttempt = Date.now() + this.config.timeout;
  }
}

// Singleton for global Discord REST circuit breaker
let globalCircuitBreaker: DiscordRestCircuitBreaker | null = null;

export function getDiscordRestCircuitBreaker(config?: CircuitBreakerConfig): DiscordRestCircuitBreaker {
  if (!globalCircuitBreaker) {
    globalCircuitBreaker = new DiscordRestCircuitBreaker(config);
  }
  return globalCircuitBreaker;
}

export function resetDiscordRestCircuitBreaker(): void {
  if (globalCircuitBreaker) {
    globalCircuitBreaker.reset();
  }
}

// Wrapper for Discord.js REST operations with circuit breaker
export async function withDiscordCircuitBreaker<T>(
  operation: () => Promise<T>,
  config?: CircuitBreakerConfig
): Promise<T> {
  const breaker = getDiscordRestCircuitBreaker(config);
  return breaker.execute(operation);
}