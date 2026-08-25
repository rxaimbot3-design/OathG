/**
 * Discord bot control routes.
 */

import type { Express, Request, Response, NextFunction } from "express";

export function registerDiscordRoutes(app: Express, getClient: () => any, requireAdminAuth: any): void {
  app.get("/api/discord/status", requireAdminAuth, (req: Request, res: Response) => {
    const client = getClient();
    res.json({
      connected: client?.isReady() || false,
      latency: client?.ws?.ping || 0,
      guilds: client?.guilds.cache.size || 0,
      users: client?.guilds.cache.reduce((acc: number, g: any) => acc + (g.memberCount || 0), 0) || 0
    });
  });

  app.post("/api/discord/connect", requireAdminAuth, async (req: Request, res: Response) => {
    // Placeholder - actual implementation would start the bot
    res.json({ success: true, message: "Discord bot connect endpoint" });
  });

  app.post("/api/discord/disconnect", requireAdminAuth, async (req: Request, res: Response) => {
    // Placeholder - actual implementation would stop the bot
    res.json({ success: true, message: "Discord bot disconnect endpoint" });
  });
}
