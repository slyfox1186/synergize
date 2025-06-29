/**
 * Redis key prefixes and patterns for consistent key management
 */

/**
 * Conversation-related key prefixes
 */
export const REDIS_KEYS = {
  // Conversation state management
  CONVERSATION_STATE: 'conversation:state:',
  CONVERSATION_TURN: 'conversation:turn:',
  CONVERSATION_COMPRESSED: 'conversation:compressed:',
  
  // Session management
  SESSION_DATA: 'session:data:',
  SESSION_ACTIVE: 'session:active:',
  SESSION_METADATA: 'session:metadata:',
  
  // Vector storage for embeddings
  EMBEDDING_VECTOR: 'embedding:vector:',
  EMBEDDING_METADATA: 'embedding:metadata:',
  EMBEDDING_INDEX: 'embedding:index:',
  
  // Query caching
  QUERY_CACHE: 'query:cache:',
  QUERY_RESULT: 'query:result:',
  
  // Context management
  CONTEXT_ALLOCATION: 'context:allocation:',
  CONTEXT_USAGE: 'context:usage:',
  
  // Model state
  MODEL_STATE: 'model:state:',
  MODEL_METRICS: 'model:metrics:',
  
  // Temporary data
  TEMP_DATA: 'temp:data:',
  TEMP_LOCK: 'temp:lock:'
} as const;

/**
 * Redis TTL values (in seconds)
 */
export const REDIS_TTL = {
  // Conversation data - 24 hours
  CONVERSATION: 86400,
  
  // Session data - 2 hours
  SESSION: 7200,
  
  // Query cache - 1 hour
  QUERY_CACHE: 3600,
  
  // Temporary data - 5 minutes
  TEMP_DATA: 300,
  
  // Lock timeout - 30 seconds
  LOCK: 30
} as const;

/**
 * Helper function to generate Redis keys
 */
export function getRedisKey(prefix: keyof typeof REDIS_KEYS, suffix: string): string {
  return `${REDIS_KEYS[prefix]}${suffix}`;
}

/**
 * Helper function to parse Redis key
 */
export function parseRedisKey(key: string): { prefix: string; suffix: string } | null {
  for (const [name, prefix] of Object.entries(REDIS_KEYS)) {
    if (key.startsWith(prefix)) {
      return {
        prefix: name,
        suffix: key.slice(prefix.length)
      };
    }
  }
  return null;
}