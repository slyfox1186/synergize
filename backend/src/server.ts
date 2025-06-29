import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import dotenv from 'dotenv';
import express from 'express';

import { SSEController } from './controllers/sseController.js';
import { corsMiddleware } from './middleware/cors.js';
import { errorHandler } from './middleware/errorHandler.js';
import { healthCheck } from './middleware/healthCheck.js';
import { ModelService } from './services/modelService.js';
import { RedisService } from './services/redisService.js';
import { createLogger } from './utils/logger.js';
import { config } from './config.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = createLogger('Server');
const app = express();
const server = createServer(app);

// Initialize services
const redisService = new RedisService();
const modelService = new ModelService();
const sseController = new SSEController(modelService, redisService);

// Middleware
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', healthCheck);

// API Routes
app.post('/api/synergize/initiate', (req, res, next) => {
  logger.info('[POST /api/synergize/initiate] Request received');
  logger.info('[POST /api/synergize/initiate] Headers:', req.headers);
  logger.info('[POST /api/synergize/initiate] Body:', req.body);
  
  const { prompt, models, sessionId } = req.body as { 
    prompt?: string; 
    models?: string[]; 
    sessionId?: string; 
  };
  
  if (!prompt || !models || models.length !== 2) {
    logger.error('[POST /api/synergize/initiate] Validation failed - missing prompt or models');
    res.status(400).json({ 
      error: 'Invalid request. Requires prompt and exactly 2 models.',
    });
    return;
  }

  if (!sessionId) {
    logger.error('[POST /api/synergize/initiate] Validation failed - missing sessionId');
    res.status(400).json({ 
      error: 'Invalid request. SessionId is required.',
    });
    return;
  }

  logger.info(`[POST /api/synergize/initiate] Storing session ${sessionId} in Redis`);
  // Store session in Redis
  redisService.storeSession(sessionId, { prompt, models, status: 'initiated' })
    .then(() => {
      logger.info(`[POST /api/synergize/initiate] Session ${sessionId} stored successfully`);
      res.json({ 
        sessionId, 
        message: 'Collaboration initiated. Connect to SSE endpoint for streaming.',
      });
    })
    .catch((error: Error) => {
      logger.error('[POST /api/synergize/initiate] Failed to store session:', error);
      next(error);
    });
});

// SSE streaming endpoint
app.get('/api/synergize/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  logger.info(`[GET /api/synergize/stream/${sessionId}] SSE connection request`);
  
  sseController.handleStream(req, res).catch((error: Error) => {
    logger.error(`[GET /api/synergize/stream/${sessionId}] SSE handler error:`, error);
    res.status(500).end();
  });
});

// Model management endpoints
app.get('/api/models', (_req, res, next) => {
  logger.info('[GET /api/models] Request received');
  
  modelService.getAvailableModels()
    .then((models) => {
      logger.info(`[GET /api/models] Returning ${models.length} models:`, { models });
      res.json({ models });
    })
    .catch((error: Error) => {
      logger.error('[GET /api/models] Failed to get models:', error);
      next(error);
    });
});

// Static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../../frontend/dist')));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
  });
}

// Error handling
app.use(errorHandler);

// Start server
const PORT = config.server.port;

async function startServer(): Promise<void> {
  try {
    // Initialize services
    await redisService.connect();
    await modelService.initialize();
    
    server.listen(PORT, () => {
      logger.info(`✨ Synergize server running on port ${PORT}`);
      logger.info(`🚀 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📡 SSE endpoint: http://localhost:${PORT}/api/synergize/stream/:sessionId`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  server.close();
  await modelService.shutdown();
  await redisService.disconnect();
  process.exit(0);
});

startServer();