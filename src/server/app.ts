/**
 * Server module - Express application setup and middleware.
 */

import express from "express";

export function createServer() {
  const app = express();

  // Basic middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // API routes will be added here
  // app.use("/api", apiRoutes);

  return app;
}
