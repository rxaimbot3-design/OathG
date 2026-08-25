/**
 * Security middleware - audit logging and IP banning.
 */

import type { Request, Response, NextFunction } from "express";

export function auditLog(action: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const originalSend = res.send;
    res.send = function (body: any) {
      console.log(`[AUDIT] ${action} - ${req.ip} - ${req.method} ${req.path}`);
      return originalSend.call(this, body);
    };
    next();
  };
}

export function ipBanCheck(req: Request, res: Response, next: NextFunction): void {
  // Placeholder - actual IP ban check would go here
  next();
}
