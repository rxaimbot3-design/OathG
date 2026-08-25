/**
 * Auth middleware for admin routes.
 */

import type { Request, Response, NextFunction } from "express";

export function requireAdminAuth(req: Request, res: Response, next: NextFunction): void {
  // Placeholder - actual implementation would check ADMIN_SECRET or session token
  const authHeader = req.headers["authorization"] || req.headers["x-admin-key"] || "";
  const token = (authHeader as string).replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  // For now, just pass through - real auth is in server.ts
  next();
}
