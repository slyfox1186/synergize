import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    server: {
      port: parseInt(env.VITE_PORT || '3000'),
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8000',
          changeOrigin: true,
          ws: true, // Enable WebSocket proxying for SSE
          timeout: 0, // Disable timeout for long-running SSE connections
          proxyTimeout: 0, // Disable proxy timeout
          configure: (proxy) => {
            // Configure proxy for SSE connections
            proxy.on('proxyReq', (proxyReq, req) => {
              if (req.url?.includes('/stream/')) {
                // Set headers for SSE
                proxyReq.setHeader('Cache-Control', 'no-cache');
                proxyReq.setHeader('Connection', 'keep-alive');
              }
            });
          }
        }
      }
    },
    build: {
      outDir: 'dist',
      sourcemap: true
    }
  };
});