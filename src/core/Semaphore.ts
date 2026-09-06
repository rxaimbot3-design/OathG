/**
 * Semaphore implementation for controlling concurrency
 * Provides proper acquire/release semantics unlike soft throttling
 */

export class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    if (permits <= 0) {
      throw new Error("Semaphore permits must be positive");
    }
    this.permits = permits;
  }

  /**
   * Acquire a permit, waiting if necessary
   */
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    // No permits available, wait
    return new Promise<void>((resolve) => {
      this.waitQueue.push(resolve);
    });
  }

  /**
   * Try to acquire a permit without waiting
   * @returns true if permit acquired, false otherwise
   */
  tryAcquire(): boolean {
    if (this.permits > 0) {
      this.permits--;
      return true;
    }
    return false;
  }

  /**
   * Release a permit
   */
  release(): void {
    this.permits++;
    
    if (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      this.permits--;
      next();
    }
  }

  /**
   * Get current available permits
   */
  availablePermits(): number {
    return this.permits;
  }

  /**
   * Get number of waiters
   */
  waitingCount(): number {
    return this.waitQueue.length;
  }
}

/**
 * Semaphore-based worker pool for controlled concurrency
 */
export class WorkerPool {
  private semaphore: Semaphore;
  private activeTasks = 0;
  private completedTasks = 0;
  private failedTasks = 0;

  constructor(maxConcurrency: number) {
    this.semaphore = new Semaphore(maxConcurrency);
  }

  /**
   * Execute a task with concurrency control
   */
  async execute<T>(task: () => Promise<T>): Promise<T> {
    await this.semaphore.acquire();
    this.activeTasks++;
    
    try {
      const result = await task();
      this.completedTasks++;
      return result;
    } catch (error) {
      this.failedTasks++;
      throw error;
    } finally {
      this.activeTasks--;
      this.semaphore.release();
    }
  }

  /**
   * Execute multiple tasks with concurrency control
   */
  async executeAll<T>(tasks: Array<() => Promise<T>>): Promise<T[]> {
    return Promise.all(tasks.map(task => this.execute(task)));
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      activeTasks: this.activeTasks,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      availablePermits: this.semaphore.availablePermits(),
      waitingCount: this.semaphore.waitingCount(),
    };
  }

  /**
   * Wait for all active tasks to complete
   */
  async drain(): Promise<void> {
    while (this.activeTasks > 0 || this.semaphore.waitingCount() > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
}