import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import {defineConfig} from 'vite';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Alias server-side modules to empty stubs for client build
        './src/core/UltraLowLatencyPipeline.js': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/core/MultiShardCluster.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/core/EdgeCacheSystem.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/core/BenchmarkEvidenceSystem.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/core/SelfHealingInfrastructure.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/core/contexts/BotContext.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/core/contexts/GuildContext.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/EnvValidator.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/CppEngine.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/security/MapManager.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/logging/logger.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/SecurityFeatures.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/bot/utils.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './discord-bot.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './server.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        // Security modules
        './src/security/PipelineIntegration.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/security/Pipeline.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/security/DistributedRateLimiter.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/security/MLAnomalyDetector.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
        './src/security/PredictiveNukeDefense.ts': path.resolve(__dirname, 'src/stubs/empty.ts'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    test: {
      globals: true,
      environment: "node",
    },
  };
});
