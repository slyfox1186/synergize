export const config = {
  // Server Configuration
  server: {
    port: parseInt(process.env.PORT || '3001'),
    host: process.env.HOST || 'localhost',
  },

  // Model Configuration
  model: {
    contextSize: parseInt(process.env.MODEL_CONTEXT_SIZE || '8192'),
    batchSize: parseInt(process.env.MODEL_BATCH_SIZE || '256'), // Reduced from 512 to prevent KV slot errors
    threads: parseInt(process.env.MODEL_THREADS || '4'),
    gpuLayers: parseInt(process.env.MODEL_GPU_LAYERS || '-1'),
    contextsPerModel: parseInt(process.env.CONTEXTS_PER_MODEL || '4'),
    // maxTokens removed - now calculated dynamically by ContextAllocator
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    ttl: 24 * 60 * 60, // 24 hours in seconds
  },

  // SSE Configuration
  sse: {
    heartbeatInterval: 30000, // 30 seconds
    reconnectInterval: 5000,  // 5 seconds
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    colorize: process.env.NODE_ENV !== 'production',
  },

  // Path Configuration
  paths: {
    modelsDirectory: '../../../models',
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },

  // Session Configuration
  session: {
    maxConcurrentSessions: parseInt(process.env.MAX_CONCURRENT_SESSIONS || '10'),
    sessionTimeout: parseInt(process.env.SESSION_TIMEOUT || '3600000'), // 1 hour in ms
  },

  // Performance Configuration
  performance: {
    streamBufferSize: 1024,
    tokenBatchSize: 1,
  },

  // Vector Store Configuration
  vectorStore: {
    embeddingModel: 'Xenova/bge-large-en-v1.5',
    embeddingDimension: 1024,
    maxSearchResults: 20,
    similarityThreshold: 0.5,
    contextCompressionRatio: 0.5, // Use 50% of context for relevant history
  },

  // Context Management - Optimized for two-LLM collaboration
  context: {
    maxHistoryPercentage: 0.25,     // Only 25% for relevant history (leaves room for generation)
    compressionThreshold: 0.4,      // Trigger compression early at 40% usage
    maxContextUsage: 0.7,           // Never exceed 70% (safety margin)
    relevantExchanges: 2,           // Only keep 2 most relevant previous exchanges per LLM
    alwaysInclude: {
      originalQuery: true,          // Always include the original user query
      lastOwnResponse: true,        // Each LLM sees their last response
      lastOtherResponse: true,      // Each LLM sees the other's last response
    }
  },
} as const;

export type Config = typeof config;