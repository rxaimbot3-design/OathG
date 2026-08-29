/**
 * GitHub routes module.
 */

import type { Express, Request, Response } from "express";

export function registerGitHubRoutes(app: Express): void {
  app.get("/api/github/status", (req: Request, res: Response) => {
    res.json({ connected: false, timestamp: new Date().toISOString() });
  });

  app.get("/api/github/repos", (req: Request, res: Response) => {
    res.json({ repos: [], timestamp: new Date().toISOString() });
  });
}
