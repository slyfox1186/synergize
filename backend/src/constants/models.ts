/**
 * Model-related constants and configuration defaults
 */

/**
 * Default model IDs used in the system
 */
export const MODEL_IDS = {
  GEMMA: 'gemma',
  QWEN: 'qwen',
  SYNTHESIS: 'synthesis' // Special ID for synthesis output routing
} as const;

/**
 * Model configuration defaults
 */
export const MODEL_DEFAULTS = {
  // Context window settings
  CONTEXT_SIZE: 4096,
  BATCH_SIZE: 512,
  
  // Generation settings
  TEMPERATURE: 0.7,
  TOP_P: 0.9,
  TOP_K: 40,
  MIN_P: 0.05,
  REPEAT_PENALTY: 1.1,
  
  // Performance settings
  THREADS: 4,
  GPU_LAYERS: -1, // Use all available GPU layers
  
  // Pool settings
  CONTEXTS_PER_MODEL: 4,
  MAX_CONCURRENT_INFERENCES: 2,
  
  // Timeout settings
  CONTEXT_WAIT_TIMEOUT: 30000, // 30 seconds
  CONTEXT_CHECK_INTERVAL: 100, // 100ms
  
  // Token buffer settings
  TOKEN_BUFFER_SIZE: 100, // For CircularBuffer in streaming
  TOKEN_CONTEXT_SIZE: 10  // Tokens to keep for detokenization context
} as const;

/**
 * Token allocation percentages by phase
 * These control how much of the context window is allocated for each phase
 */
export const TOKEN_ALLOCATION_PERCENTAGES = {
  // Phase-specific allocations (as percentage of available context)
  BRAINSTORM: {
    contextPercentage: 0.15,  // 15% for conversation history
    generationPercentage: 0.35 // 35% for new generation
  },
  CRITIQUE: {
    contextPercentage: 0.25,  // 25% for history (needs more context)
    generationPercentage: 0.25 // 25% for critique
  },
  REVISE: {
    contextPercentage: 0.30,  // 30% for history
    generationPercentage: 0.20 // 20% for revision
  },
  SYNTHESIZE: {
    contextPercentage: 0.20,  // 20% for history
    generationPercentage: 0.30 // 30% for synthesis
  },
  CONSENSUS: {
    contextPercentage: 0.25,  // 25% for history
    generationPercentage: 0.25 // 25% for consensus
  },
  DEFAULT: {
    contextPercentage: 0.20,  // 20% default
    generationPercentage: 0.30 // 30% default
  }
} as const;

/**
 * Model file extensions
 */
export const MODEL_FILE_EXTENSIONS = ['.gguf'] as const;

/**
 * Performance thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
  // Token generation
  MIN_TOKENS_PER_SECOND: 10,
  TARGET_TOKENS_PER_SECOND: 50,
  
  // Memory usage
  MAX_MEMORY_GB: 8,
  WARNING_MEMORY_GB: 6,
  
  // Context usage warnings
  HIGH_CONTEXT_USAGE_THRESHOLD: 0.9, // Warn at 90% usage
  CRITICAL_CONTEXT_USAGE_THRESHOLD: 0.95 // Critical at 95% usage
} as const;