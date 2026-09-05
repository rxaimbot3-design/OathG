import { MultiShardCluster } from "./MultiShardCluster.js";
import { log, createModuleLogger } from "../logging/logger.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createModuleLogger("ClusterMain");

async function main() {
  const totalShards = process.env.TOTAL_SHARDS 
    ? parseInt(process.env.TOTAL_SHARDS, 10) 
    : "auto";
  const shardsPerWorker = process.env.SHARDS_PER_WORKER 
    ? parseInt(process.env.SHARDS_PER_WORKER, 10) 
    : 1;

  // Path to the built shard worker - resolve relative to this file
  const workerScript = join(__dirname, "..", "..", "server-build", "ShardWorker.mjs");

  logger.info({ module: "ClusterMain" }, "🚀 Starting Discord Bot Cluster", { 
    totalShards, 
    shardsPerWorker,
    isMaster: process.env.CLUSTER_MASTER === "true",
    workerScript
  });

  const cluster = MultiShardCluster.getInstance({
    totalShards,
    shardsPerWorker,
    workerScript
  });

  const metrics = cluster.getMetrics();
  logger.info({ module: "ClusterMain" }, "Cluster initialized", metrics);

  process.on("SIGTERM", async () => {
    logger.info({ module: "ClusterMain" }, "SIGTERM received, shutting down cluster...");
    await cluster.shutdown();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info({ module: "ClusterMain" }, "SIGINT received, shutting down cluster...");
    await cluster.shutdown();
    process.exit(0);
  });
}

main();