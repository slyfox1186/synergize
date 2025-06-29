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
      // Suppress proxy error logging during expected startup failures
      middlewareMode: false,
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8000',
          changeOrigin: true,
          ws: true, // Enable WebSocket proxying for SSE
          timeout: 0, // Disable timeout for long-running SSE connections
          proxyTimeout: 0, // Disable proxy timeout
          secure: false, // Don't verify SSL certificates
          logLevel: 'silent', // Suppress proxy error logging
          configure: (proxy) => {
            // Configure proxy for SSE connections
            proxy.on('proxyReq', (proxyReq, req) => {
              if (req.url?.includes('/stream/')) {
                // Set headers for SSE
                proxyReq.setHeader('Cache-Control', 'no-cache');
                proxyReq.setHeader('Connection', 'keep-alive');
              }
            });
            
            // Suppress ECONNREFUSED errors during expected startup sequence
            proxy.on('error', (err, req, res) => {
              if (err.code === 'ECONNREFUSED') {
                // These are expected during server startup - suppress the error logs
                // Just return a 503 Service Unavailable instead of logging scary errors
                if (!res.headersSent) {
                  res.writeHead(503, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ error: 'Server starting up...' }));
                }
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