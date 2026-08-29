/**
 * Premium routes module.
 */

import type { Express, Request, Response } from "express";

export function registerPremiumRoutes(app: Express): void {
  app.get("/api/premium/info", (req: Request, res: Response) => {
    res.json({ premium: false, features: [], timestamp: new Date().toISOString() });
  });

  app.post("/api/premium/activate", (req: Request, res: Response) => {
    res.json({ success: true, message: "Premium activation endpoint" });
  });
}
