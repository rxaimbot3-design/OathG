/**
 * Health check routes.
 */

import type { Express, Request, Response } from "express";

export function registerHealthRoutes(app: Express, getClient: () => any, CppNativeEngine: any): void {
  app.get("/api/health", (req: Request, res: Response) => {
    const client = getClient();
    const checks: any = {};

    try {
      checks.discordBot = { status: client?.isReady() ? "up" : "down" };
    } catch {
      checks.discordBot = { status: "down" };
    }

    try {
      const cppMetrics = CppNativeEngine.getMetrics();
      checks.cppEngine = {
        status: cppMetrics?.status !== "OFFLINE" ? "up" : "down",
        nativeLoaded: cppMetrics?.engineName?.includes("Native") || false
      };
    } catch {
      checks.cppEngine = { status: "down", nativeLoaded: false };
    }

    const allUp = Object.values(checks).every((c: any) => c.status === "up");
    const status = allUp ? "healthy" : "degraded";

    res.json({
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      checks,
      version: "1.0.0"
    });
  });
}
