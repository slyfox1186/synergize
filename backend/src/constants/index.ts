/**
 * Central constants module - re-exports all constants for easy access
 */

// Phase-related constants
export * from './phases.js';

// Redis key management
export * from './redis.js';

// Model configuration and defaults
export * from './models.js';

// Common error messages
export const ERROR_MESSAGES = {
  // Model errors
  MODEL_NOT_FOUND: 'Model configuration not found',
  MODEL_LOAD_FAILED: 'Failed to load model',
  CONTEXT_NOT_AVAILABLE: 'No context available for model',
  CONTEXT_TIMEOUT: 'Timeout waiting for available context',
  
  // Conversation errors
  CONVERSATION_NOT_FOUND: 'Conversation not found',
  INVALID_PHASE: 'Invalid collaboration phase',
  PHASE_TRANSITION_FAILED: 'Failed to transition phase',
  
  // Token errors
  TOKEN_LIMIT_EXCEEDED: 'Token limit exceeded',
  TOKEN_ALLOCATION_FAILED: 'Token allocation validation failed',
  
  // Redis errors
  REDIS_CONNECTION_FAILED: 'Failed to connect to Redis',
  REDIS_OPERATION_FAILED: 'Redis operation failed',
  
  // Validation errors
  INVALID_INPUT: 'Invalid input provided',
  MISSING_REQUIRED_FIELD: 'Missing required field',
  
  // System errors
  INITIALIZATION_FAILED: 'System initialization failed',
  SHUTDOWN_ERROR: 'Error during shutdown'
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  MODEL_LOADED: 'Model loaded successfully',
  CONTEXT_ACQUIRED: 'Context acquired successfully',
  CONVERSATION_CREATED: 'Conversation created successfully',
  PHASE_TRANSITIONED: 'Phase transitioned successfully',
  SYNTHESIS_COMPLETE: 'Synthesis completed successfully'
} as const;