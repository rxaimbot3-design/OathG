/**
 * Analytics routes module.
 */

import type { Express, Request, Response } from "express";

export function registerAnalyticsRoutes(app: Express): void {
  app.get("/api/analytics/overview", (req: Request, res: Response) => {
    res.json({
      overview: {
        totalGuilds: 0,
        totalUsers: 0,
        threatsBlocked: 0,
        uptime: Math.round(process.uptime())
      },
      timestamp: new Date().toISOString()
    });
  });

  app.get("/api/economy/leaderboard", (req: Request, res: Response) => {
    res.json({ leaderboard: [], timestamp: new Date().toISOString() });
  });
}
