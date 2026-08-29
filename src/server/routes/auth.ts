/**
 * Auth routes module.
 */

import type { Express, Request, Response } from "express";

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/discord/login", (req: Request, res: Response) => {
    res.json({ success: true, message: "Discord OAuth login endpoint" });
  });

  app.post("/api/auth/login", (req: Request, res: Response) => {
    res.json({ success: true, message: "Admin login endpoint" });
  });

  app.get("/api/auth/session", (req: Request, res: Response) => {
    res.json({ authenticated: false, message: "Session check endpoint" });
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    res.json({ success: true, message: "Logout endpoint" });
  });

  app.post("/api/auth/revoke-all", (req: Request, res: Response) => {
    res.json({ success: true, message: "Revoke all sessions endpoint" });
  });
}
