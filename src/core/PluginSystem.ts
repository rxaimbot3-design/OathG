import { EventEmitter } from "events";
import { log, createModuleLogger } from "../logging/logger.js";

const logger = createModuleLogger("PluginSystem");

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  main: string;
  dependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
  permissions: PluginPermission[];
  hooks: PluginHook[];
  config: PluginConfigSchema;
  minBotVersion: string;
  maxBotVersion?: string;
}

export interface PluginPermission {
  type: "discord" | "database" | "network" | "filesystem" | "config" | "admin";
  scope: string[];
  description: string;
}

export interface PluginHook {
  event: string;
  priority: number;
  handler: string;
  description: string;
}

export interface PluginConfigSchema {
  type: "object";
  properties: Record<string, {
    type: "string" | "number" | "boolean" | "object" | "array";
    description: string;
    default?: any;
    required?: boolean;
    enum?: any[];
  }>;
  required: string[];
}

export interface PluginInstance {
  manifest: PluginManifest;
  instance: any;
  config: Record<string, any>;
  state: "loading" | "loaded" | "enabled" | "disabled" | "error" | "unloading";
  error?: string;
  loadTime: number;
  enableTime?: number;
  exports: Record<string, any>;
}

export interface PluginContext {
  bot: any;
  config: Record<string, any>;
  logger: any;
  database: any;
  discord: any;
  api: PluginAPI;
  events: EventEmitter;
  storage: PluginStorage;
  utils: PluginUtils;
}

export interface PluginAPI {
  registerCommand: (command: PluginCommand) => void;
  unregisterCommand: (commandId: string) => void;
  registerEvent: (event: string, handler: (...args: any[]) => void, priority?: number) => void;
  unregisterEvent: (event: string, handler: (...args: any[]) => void) => void;
  registerMiddleware: (middleware: PluginMiddleware) => void;
  unregisterMiddleware: (middlewareId: string) => void;
  registerWebRoute: (route: PluginWebRoute) => void;
  unregisterWebRoute: (routeId: string) => void;
  getConfig: (key: string) => any;
  setConfig: (key: string, value: any) => void;
  emit: (event: string, data: any) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  off: (event: string, handler: (...args: any[]) => void) => void;
}

export interface PluginCommand {
  id: string;
  name: string;
  description: string;
  options: PluginCommandOption[];
  handler: (interaction: any, context: PluginContext) => Promise<void>;
  permissions?: string[];
  cooldown?: number;
}

export interface PluginCommandOption {
  name: string;
  type: "string" | "number" | "boolean" | "user" | "channel" | "role" | "mentionable";
  description: string;
  required: boolean;
  choices?: Array<{ name: string; value: string | number }>;
  autocomplete?: boolean;
}

export interface PluginMiddleware {
  id: string;
  name: string;
  type: "pre" | "post" | "error";
  handler: (context: any, next: () => Promise<void>) => Promise<void>;
  priority: number;
}

export interface PluginWebRoute {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  handler: (req: any, res: any, context: PluginContext) => Promise<void>;
  authentication?: boolean;
  rateLimit?: { windowMs: number; maxRequests: number };
}

export interface PluginStorage {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (prefix: string) => Promise<string[]>;
  clear: () => Promise<void>;
}

export interface PluginUtils {
  http: {
    get: (url: string, options?: any) => Promise<any>;
    post: (url: string, data: any, options?: any) => Promise<any>;
    put: (url: string, data: any, options?: any) => Promise<any>;
    delete: (url: string, options?: any) => Promise<any>;
  };
  crypto: {
    hash: (data: string, algorithm?: string) => string;
    encrypt: (data: string, key: string) => string;
    decrypt: (data: string, key: string) => string;
    randomBytes: (size: number) => Buffer;
  };
  validation: {
    validateSchema: (data: any, schema: any) => { valid: boolean; errors: string[] };
    sanitize: (input: string) => string;
  };
  formatting: {
    formatNumber: (num: number, locale?: string) => string;
    formatDate: (date: Date, format?: string) => string;
    truncate: (str: string, length: number) => string;
  };
}

interface PluginSystemEvents {
  pluginLoaded: [PluginInstance];
  pluginError: [{ pluginId: string; error: unknown }];
  pluginEnabled: [PluginInstance];
  pluginDisabled: [PluginInstance];
  pluginUnloaded: [{ pluginId: string }];
}

export class PluginSystem extends EventEmitter<PluginSystemEvents> {
  private static instance: PluginSystem;
  
  private plugins = new Map<string, PluginInstance>();
  private pluginDir: string;
  private globalConfig: Record<string, any> = {};
  private hookRegistry = new Map<string, Array<{ pluginId: string; handler: (...args: any[]) => void; priority: number }>>();
  private commandRegistry = new Map<string, PluginCommand>();
  private middlewareRegistry = new Map<string, PluginMiddleware>();
  private webRouteRegistry = new Map<string, PluginWebRoute>();
  private pluginContexts = new Map<string, PluginContext>();
  private loadingQueue: Array<{ pluginId: string; resolve: Function; reject: Function }> = [];
  private isLoading = false;
  
  private constructor(pluginDir: string = "./plugins") {
    super();
    this.pluginDir = pluginDir;
    this.initializeCoreAPI();
  }
  
  static getInstance(pluginDir?: string): PluginSystem {
    if (!PluginSystem.instance) {
      PluginSystem.instance = new PluginSystem(pluginDir);
    }
    return PluginSystem.instance;
  }
  
  private initializeCoreAPI() {
    log.info({ module: "PluginSystem" }, "PluginSystem core API initialized");
  }
  
  async loadPlugin(pluginPath: string, config: Record<string, any> = {}): Promise<PluginInstance> {
    const manifest = await this.loadManifest(pluginPath);
    
    if (this.plugins.has(manifest.id)) {
      throw new Error(`Plugin ${manifest.id} already loaded`);
    }
    
    const pluginInstance: PluginInstance = {
      manifest,
      instance: null,
      config: { ...this.getDefaultConfig(manifest), ...config },
      state: "loading",
      loadTime: Date.now(),
      exports: {}
    };
    
    this.plugins.set(manifest.id, pluginInstance);
    
    try {
      const pluginModule = await import(pluginPath);
      const PluginClass = pluginModule.default || pluginModule[manifest.name] || pluginModule.Plugin;
      
      if (!PluginClass) {
        throw new Error("Plugin must export a default class");
      }
      
      const context = await this.createPluginContext(manifest.id);
      const instance = new PluginClass(context);
      
      pluginInstance.instance = instance;
      pluginInstance.state = "loaded";
      
      if (instance.initialize) {
        await instance.initialize();
      }
      
      this.registerPluginHooks(manifest.id);
      this.registerPluginCommands(manifest.id);
      this.registerPluginMiddleware(manifest.id);
      this.registerPluginWebRoutes(manifest.id);
      
      pluginInstance.state = "enabled";
      pluginInstance.enableTime = Date.now();
      
      log.info({ module: "PluginSystem" }, "Plugin loaded successfully", { 
        pluginId: manifest.id, 
        name: manifest.name, 
        version: manifest.version 
      });
      
      this.emit("pluginLoaded", pluginInstance);
      
      return pluginInstance;
      
    } catch (err) {
      pluginInstance.state = "error";
      pluginInstance.error = String(err);
      log.error({ module: "PluginSystem" }, "Failed to load plugin", { pluginId: manifest.id, error: err });
      this.emit("pluginError", { pluginId: manifest.id, error: err });
      throw err;
    }
  }
  
  private async loadManifest(pluginPath: string): Promise<PluginManifest> {
    try {
      const manifestModule = await import(`${pluginPath}/manifest.json`, { with: { type: "json" } });
      return manifestModule.default;
    } catch {
      throw new Error("Plugin must have a manifest.json");
    }
  }
  
  private getDefaultConfig(manifest: PluginManifest): Record<string, any> {
    const defaults: Record<string, any> = {};
    for (const [key, schema] of Object.entries(manifest.config.properties)) {
      if (schema.default !== undefined) {
        defaults[key] = schema.default;
      }
    }
    return defaults;
  }
  
  private async createPluginContext(pluginId: string): Promise<PluginContext> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    
    const context: PluginContext = {
      bot: null,
      config: plugin.config,
      logger: createModuleLogger(`plugin:${pluginId}`),
      database: null,
      discord: null,
      api: this.createPluginAPI(pluginId),
      events: new EventEmitter(),
      storage: this.createPluginStorage(pluginId),
      utils: this.createPluginUtils()
    };
    
    this.pluginContexts.set(pluginId, context);
    return context;
  }
  
  private createPluginAPI(pluginId: string): PluginAPI {
    return {
      registerCommand: (command: PluginCommand) => {
        const fullId = `${pluginId}:${command.id}`;
        this.commandRegistry.set(fullId, command);
        log.debug({ module: "PluginSystem" }, "Plugin command registered", { pluginId, commandId: command.id });
      },
      unregisterCommand: (commandId: string) => {
        const fullId = `${pluginId}:${commandId}`;
        this.commandRegistry.delete(fullId);
      },
      registerEvent: (event: string, handler: (...args: any[]) => void, priority: number = 0) => {
        if (!this.hookRegistry.has(event)) {
          this.hookRegistry.set(event, []);
        }
        this.hookRegistry.get(event)!.push({ pluginId, handler, priority });
        this.hookRegistry.get(event)!.sort((a, b) => b.priority - a.priority);
      },
      unregisterEvent: (event: string, handler: (...args: any[]) => void) => {
        const hooks = this.hookRegistry.get(event);
        if (hooks) {
          const index = hooks.findIndex(h => h.handler === handler && h.pluginId === pluginId);
          if (index !== -1) hooks.splice(index, 1);
        }
      },
      registerMiddleware: (middleware: PluginMiddleware) => {
        const fullId = `${pluginId}:${middleware.id}`;
        this.middlewareRegistry.set(fullId, middleware);
      },
      unregisterMiddleware: (middlewareId: string) => {
        const fullId = `${pluginId}:${middlewareId}`;
        this.middlewareRegistry.delete(fullId);
      },
      registerWebRoute: (route: PluginWebRoute) => {
        const fullId = `${pluginId}:${route.id}`;
        this.webRouteRegistry.set(fullId, route);
      },
      unregisterWebRoute: (routeId: string) => {
        const fullId = `${pluginId}:${routeId}`;
        this.webRouteRegistry.delete(fullId);
      },
      getConfig: (key: string) => {
        const plugin = this.plugins.get(pluginId);
        return plugin?.config[key];
      },
      setConfig: (key: string, value: any) => {
        const plugin = this.plugins.get(pluginId);
        if (plugin) {
          plugin.config[key] = value;
        }
      },
      emit: (event: string, data: any) => {
        (this as any).emit(`${pluginId}:${event}`, data);
        (this as any).emit(event, { pluginId, data });
      },
      on: (event: string, handler: (...args: any[]) => void) => {
        (this as any).on(`${pluginId}:${event}`, handler);
      },
      off: (event: string, handler: (...args: any[]) => void) => {
        (this as any).off(`${pluginId}:${event}`, handler);
      }
    };
  }
  
  private createPluginStorage(pluginId: string): PluginStorage {
    const prefix = `plugin:${pluginId}:`;
    const storage = new Map<string, any>();
    
    return {
      get: async (key: string) => storage.get(`${prefix}${key}`),
      set: async (key: string, value: any) => { storage.set(`${prefix}${key}`, value); },
      delete: async (key: string) => { storage.delete(`${prefix}${key}`); },
      list: async (prefix_: string) => Array.from(storage.keys()).filter(k => k.startsWith(`${prefix}${prefix_}`)),
      clear: async () => {
        for (const key of storage.keys()) {
          if (key.startsWith(prefix)) storage.delete(key);
        }
      }
    };
  }
  
  private createPluginUtils(): PluginUtils {
    return {
      http: {
        get: async (url: string, options?: any) => {
          const response = await fetch(url, { ...options, method: "GET" });
          return response.json();
        },
        post: async (url: string, data: any, options?: any) => {
          const response = await fetch(url, { 
            ...options, 
            method: "POST", 
            headers: { "Content-Type": "application/json", ...options?.headers },
            body: JSON.stringify(data)
          });
          return response.json();
        },
        put: async (url: string, data: any, options?: any) => {
          const response = await fetch(url, { 
            ...options, 
            method: "PUT", 
            headers: { "Content-Type": "application/json", ...options?.headers },
            body: JSON.stringify(data)
          });
          return response.json();
        },
        delete: async (url: string, options?: any) => {
          const response = await fetch(url, { ...options, method: "DELETE" });
          return response.json();
        }
      },
      crypto: {
        hash: (data: string, algorithm: string = "sha256") => {
          const crypto = require("crypto");
          return crypto.createHash(algorithm).update(data).digest("hex");
        },
        encrypt: (data: string, key: string) => {
          const crypto = require("crypto");
          const iv = crypto.randomBytes(16);
          const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
          const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
          const authTag = cipher.getAuthTag();
          return Buffer.concat([iv, authTag, encrypted]).toString("base64");
        },
        decrypt: (data: string, key: string) => {
          const crypto = require("crypto");
          const buffer = Buffer.from(data, "base64");
          const iv = buffer.slice(0, 16);
          const authTag = buffer.slice(16, 32);
          const encrypted = buffer.slice(32);
          const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
          decipher.setAuthTag(authTag);
          return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
        },
        randomBytes: (size: number) => require("crypto").randomBytes(size)
      },
      validation: {
        validateSchema: (data: any, schema: any) => {
          const errors: string[] = [];
          return { valid: errors.length === 0, errors };
        },
        sanitize: (input: string) => input.replace(/[<>\"'&]/g, "")
      },
      formatting: {
        formatNumber: (num: number, locale: string = "en-US") => new Intl.NumberFormat(locale).format(num),
        formatDate: (date: Date, format: string = "short") => new Intl.DateTimeFormat("en-US", { dateStyle: format as any }).format(date),
        truncate: (str: string, length: number) => str.length > length ? str.slice(0, length - 3) + "..." : str
      }
    };
  }
  
  private registerPluginHooks(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.manifest.hooks) return;
    
    for (const hook of plugin.manifest.hooks) {
      if (!this.hookRegistry.has(hook.event)) {
        this.hookRegistry.set(hook.event, []);
      }
      this.hookRegistry.get(hook.event)!.push({
        pluginId,
        handler: plugin.instance[hook.handler],
        priority: hook.priority
      });
      this.hookRegistry.get(hook.event)!.sort((a, b) => b.priority - a.priority);
    }
  }
  
  private registerPluginCommands(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.instance.registerCommands) return;
    
    const commands = plugin.instance.registerCommands();
    for (const command of commands) {
      this.commandRegistry.set(`${pluginId}:${command.id}`, command);
    }
  }
  
  private registerPluginMiddleware(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.instance.registerMiddleware) return;
    
    const middlewares = plugin.instance.registerMiddleware();
    for (const middleware of middlewares) {
      this.middlewareRegistry.set(`${pluginId}:${middleware.id}`, middleware);
    }
  }
  
  private registerPluginWebRoutes(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin || !plugin.instance.registerWebRoutes) return;
    
    const routes = plugin.instance.registerWebRoutes();
    for (const route of routes) {
      this.webRouteRegistry.set(`${pluginId}:${route.id}`, route);
    }
  }
  
  async enablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    if (plugin.state === "enabled") return;
    
    plugin.state = "enabled";
    plugin.enableTime = Date.now();
    
    if (plugin.instance.onEnable) {
      await plugin.instance.onEnable();
    }
    
    this.registerPluginHooks(pluginId);
    this.registerPluginCommands(pluginId);
    this.registerPluginMiddleware(pluginId);
    this.registerPluginWebRoutes(pluginId);
    
    this.emit("pluginEnabled", plugin);
    log.info({ module: "PluginSystem" }, "Plugin enabled", { pluginId });
  }
  
  async disablePlugin(pluginId: string): Promise<void> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    if (plugin.state === "disabled") return;
    
    plugin.state = "unloading";
    
    if (plugin.instance.onDisable) {
      await plugin.instance.onDisable();
    }
    
    for (const [event, hooks] of this.hookRegistry.entries()) {
      const filtered = hooks.filter(h => h.pluginId !== pluginId);
      if (filtered.length === 0) this.hookRegistry.delete(event);
      else this.hookRegistry.set(event, filtered);
    }
    
    for (const [id, cmd] of this.commandRegistry.entries()) {
      if (id.startsWith(`${pluginId}:`)) this.commandRegistry.delete(id);
    }
    
    for (const [id, mw] of this.middlewareRegistry.entries()) {
      if (id.startsWith(`${pluginId}:`)) this.middlewareRegistry.delete(id);
    }
    
    for (const [id, route] of this.webRouteRegistry.entries()) {
      if (id.startsWith(`${pluginId}:`)) this.webRouteRegistry.delete(id);
    }
    
    plugin.state = "disabled";
    this.emit("pluginDisabled", plugin);
    log.info({ module: "PluginSystem" }, "Plugin disabled", { pluginId });
  }
  
  async unloadPlugin(pluginId: string): Promise<void> {
    await this.disablePlugin(pluginId);
    
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;
    
    if (plugin.instance.shutdown) {
      await plugin.instance.shutdown();
    }
    
    this.plugins.delete(pluginId);
    this.pluginContexts.delete(pluginId);
    
    this.emit("pluginUnloaded", { pluginId });
    log.info({ module: "PluginSystem" }, "Plugin unloaded", { pluginId });
  }
  
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId);
  }
  
  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }
  
  getEnabledPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values()).filter(p => p.state === "enabled");
  }
  
  getHooks(event: string): Array<{ pluginId: string; handler: (...args: any[]) => void; priority: number }> {
    return this.hookRegistry.get(event) || [];
  }
  
  getCommands(): PluginCommand[] {
    return Array.from(this.commandRegistry.values());
  }
  
  getMiddlewares(): PluginMiddleware[] {
    return Array.from(this.middlewareRegistry.values()).sort((a, b) => b.priority - a.priority);
  }
  
  getWebRoutes(): PluginWebRoute[] {
    return Array.from(this.webRouteRegistry.values());
  }
  
  async executeHook(event: string, data: any): Promise<any[]> {
    const hooks = this.getHooks(event);
    const results = [];
    
    for (const hook of hooks) {
      try {
        const result = await hook.handler(data);
        results.push({ pluginId: hook.pluginId, result });
      } catch (err) {
        log.error({ module: "PluginSystem" }, "Plugin hook error", { event, pluginId: hook.pluginId, error: err });
        results.push({ pluginId: hook.pluginId, error: err });
      }
    }
    
    return results;
  }
  
  // executeMiddlewares(context: any) {
//     const middlewares = this.getMiddlewares();
//     const promises: Promise<void>[] = [];
//     
//     for (const middleware of middlewares) {
//       if (middleware.type === "pre" || middleware.type === "error") {
//         promises.push(new Promise<void>((resolve, reject) => {
//           middleware.handler(context, () => resolve()).catch(reject);
//         }));
//       }
//     }
//     
//     return new Promise<void>((resolve) => {
//       Promise.all(promises).then(() => resolve());
//     }) as Promise<void>;
//   }
  
  async shutdown() {
    for (const pluginId of this.plugins.keys()) {
      await this.unloadPlugin(pluginId);
    }
    this.hookRegistry.clear();
    this.commandRegistry.clear();
    this.middlewareRegistry.clear();
    this.webRouteRegistry.clear();
    this.pluginContexts.clear();
    this.removeAllListeners();
    log.info({ module: "PluginSystem" }, "PluginSystem shutdown complete");
  }
}

export const pluginSystem = PluginSystem.getInstance();