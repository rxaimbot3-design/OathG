/**
 * Simple Dependency Injection Container
 * 
 * Lightweight DI container for managing service lifecycles and dependencies.
 * Supports singletons, transients, and factory functions.
 */

export type Lifetime = 'singleton' | 'transient' | 'scoped';

export interface ServiceRegistration<T> {
  token: string | symbol;
  factory: (container: Container) => T | Promise<T>;
  lifetime: Lifetime;
  instance?: T;
}

export interface ContainerOptions {
  /** Enable circular dependency detection */
  detectCircular?: boolean;
  /** Parent container for hierarchical DI */
  parent?: Container;
}

export class Container {
  private registrations = new Map<string | symbol, ServiceRegistration<any>>();
  private scopedInstances = new Map<string | symbol, any>();
  private resolutionStack = new Set<string | symbol>();
  private options: Required<ContainerOptions>;
  private parent?: Container;

  constructor(options: ContainerOptions = {}) {
    this.options = {
      detectCircular: options.detectCircular ?? true,
      parent: options.parent,
    };
    this.parent = options.parent;
  }

  /** Register a singleton service */
  registerSingleton<T>(token: string | symbol, factory: (container: Container) => T | Promise<T>): this {
    this.registrations.set(token, {
      token,
      factory,
      lifetime: 'singleton',
    });
    return this;
  }

  /** Register a transient service (new instance each time) */
  registerTransient<T>(token: string | symbol, factory: (container: Container) => T | Promise<T>): this {
    this.registrations.set(token, {
      token,
      factory,
      lifetime: 'transient',
    });
    return this;
  }

  /** Register a scoped service (one instance per scope) */
  registerScoped<T>(token: string | symbol, factory: (container: Container) => T | Promise<T>): this {
    this.registrations.set(token, {
      token,
      factory,
      lifetime: 'scoped',
    });
    return this;
  }

  /** Register an existing instance as singleton */
  registerInstance<T>(token: string | symbol, instance: T): this {
    this.registrations.set(token, {
      token,
      factory: () => instance,
      lifetime: 'singleton',
      instance,
    });
    return this;
  }

  /** Check if a token is registered */
  has(token: string | symbol): boolean {
    return this.registrations.has(token) || (this.parent ? this.parent.has(token) : false);
  }

  /** Get a service (async) */
  async get<T>(token: string | symbol): Promise<T> {
    const registration = this.registrations.get(token);
    
    if (!registration) {
      if (this.parent) {
        return this.parent.get(token);
      }
      throw new Error(`Service not registered: ${String(token)}`);
    }

    // Return existing singleton instance
    if (registration.lifetime === 'singleton' && registration.instance !== undefined) {
      return registration.instance;
    }

    // Return existing scoped instance
    if (registration.lifetime === 'scoped' && this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token);
    }

    // Circular dependency detection
    if (this.options.detectCircular && this.resolutionStack.has(token)) {
      const cycle = [...this.resolutionStack, token].join(' -> ');
      throw new Error(`Circular dependency detected: ${cycle}`);
    }

    this.resolutionStack.add(token);

    try {
      const instance = await registration.factory(this);
      
      if (registration.lifetime === 'singleton') {
        registration.instance = instance;
      } else if (registration.lifetime === 'scoped') {
        this.scopedInstances.set(token, instance);
      }
      
      return instance;
    } finally {
      this.resolutionStack.delete(token);
    }
  }

  /** Get a service (sync - only works for already instantiated singletons) */
  getSync<T>(token: string | symbol): T {
    const registration = this.registrations.get(token);
    
    if (!registration) {
      if (this.parent) {
        return this.parent.getSync(token);
      }
      throw new Error(`Service not registered: ${String(token)}`);
    }

    if (registration.lifetime === 'singleton' && registration.instance !== undefined) {
      return registration.instance;
    }

    throw new Error(`Service not yet instantiated (use get() for async): ${String(token)}`);
  }

  /** Create a child scope for scoped services */
  createScope(): Container {
    return new Container({ parent: this, detectCircular: this.options.detectCircular });
  }

  /** Clear scoped instances (end of scope) */
  clearScope(): void {
    this.scopedInstances.clear();
  }

  /** Clear all registrations and instances */
  clear(): void {
    this.registrations.clear();
    this.scopedInstances.clear();
    this.resolutionStack.clear();
  }

  /** Get all registered tokens */
  keys(): Array<string | symbol> {
    return Array.from(this.registrations.keys());
  }
}

/** Global application container */
let globalContainer: Container | null = null;

/** Get or create the global container */
export function getContainer(): Container {
  if (!globalContainer) {
    globalContainer = new Container();
  }
  return globalContainer;
}

/** Set the global container (for testing) */
export function setContainer(container: Container): void {
  globalContainer = container;
}

/** Reset the global container */
export function resetContainer(): void {
  globalContainer = null;
}

/** Decorator for injecting dependencies */
export function Inject(token: string | symbol) {
  return function (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) {
    const tokens = Reflect.getMetadata('inject:tokens', target) || [];
    tokens[parameterIndex] = token;
    Reflect.defineMetadata('inject:tokens', tokens, target);
  };
}

/** Decorator for marking a class as injectable */
export function Injectable() {
  return function <T extends { new (...args: any[]): any }>(constructor: T) {
    return constructor;
  };
}

/** Resolve constructor dependencies automatically */
export async function resolve<T>(container: Container, constructor: new (...args: any[]) => T): Promise<T> {
  const tokens = Reflect.getMetadata('inject:tokens', constructor) || [];
  const args = await Promise.all(tokens.map((token: string | symbol) => container.get(token)));
  return new constructor(...args);
}