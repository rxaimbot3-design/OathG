/**
 * System routes module.
 */

import type { Express, Request, Response } from "express";

export function registerSystemRoutes(app: Express): void {
  app.post("/api/system/restart", (req: Request, res: Response) => {
    res.json({ success: true, message: "System restart initiated" });
  });
}
