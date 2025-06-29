import { Redis } from 'ioredis';
import { EmbeddingService } from './embeddingService.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';

interface VectorDocument {
  id: string;
  content: string;
  vector: number[];
  metadata: {
    sessionId: string;
    phase: string;
    modelId: string;
    timestamp: number;
    tokens: number;
  };
}

interface SearchResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

// Type definitions for Redis FT.SEARCH response
type RedisSearchResponse = [
  number,           // Total number of results
  ...Array<[
    string,         // Document key
    Array<string>   // Field name-value pairs
  ]>
];

export class RedisVectorStore {
  private redis: Redis;
  private embeddingService: EmbeddingService;
  private readonly logger = createLogger('RedisVectorStore');
  private readonly indexName = 'idx:synergize';
  private readonly keyPrefix = 'doc:synergize:';
  private indexCreated = false;

  constructor(redis: Redis) {
    this.redis = redis;
    this.embeddingService = new EmbeddingService();
  }

  async initialize(): Promise<void> {
    await this.embeddingService.initialize();
    await this.createIndex();
    this.logger.info('✅ Redis vector store initialized');
  }

  private async createIndex(): Promise<void> {
    try {
      // Check if index exists
      try {
        await this.redis.call('FT.INFO', this.indexName);
        this.indexCreated = true;
        this.logger.info('Vector index already exists');
        return;
      } catch (error) {
        // Index doesn't exist, create it
      }

      // Create the index with vector field
      const dimension = config.vectorStore.embeddingDimension;
      
      await this.redis.call(
        'FT.CREATE',
        this.indexName,
        'ON', 'JSON',
        'PREFIX', '1', this.keyPrefix,
        'SCHEMA',
        '$.content', 'TEXT',
        '$.metadata.sessionId', 'TAG',
        '$.metadata.phase', 'TAG',
        '$.metadata.modelId', 'TAG',
        '$.metadata.timestamp', 'NUMERIC', 'SORTABLE',
        '$.metadata.tokens', 'NUMERIC',
        '$.vector', 'VECTOR', 'FLAT', '6',
        'TYPE', 'FLOAT32',
        'DIM', dimension.toString(),
        'DISTANCE_METRIC', 'COSINE'
      );

      this.indexCreated = true;
      this.logger.info(`Created vector index ${this.indexName} with dimension ${dimension}`);
    } catch (error) {
      this.logger.error('Failed to create vector index:', error);
      // Continue without vector search if Redis doesn't support it
      this.indexCreated = false;
    }
  }

  async storeDocument(
    id: string,
    content: string,
    metadata: VectorDocument['metadata']
  ): Promise<void> {
    try {
      // Generate embedding
      const vector = await this.embeddingService.embed(content);
      
      // Create document
      const doc: VectorDocument = {
        id,
        content,
        vector,
        metadata,
      };
      
      // Store as JSON
      const key = `${this.keyPrefix}${id}`;
      await this.redis.call(
        'JSON.SET',
        key,
        '$',
        JSON.stringify(doc)
      );
      
      this.logger.debug(`Stored document ${id} with vector dimension ${vector.length}`);
    } catch (error) {
      this.logger.error('Failed to store document:', error);
      throw error;
    }
  }

  async updateDocument(
    id: string,
    content: string,
    additionalMetadata: Record<string, unknown>
  ): Promise<void> {
    try {
      const key = `${this.keyPrefix}${id}`;
      
      // Get existing document
      const existingDoc = await this.redis.call('JSON.GET', key);
      if (!existingDoc) {
        throw new Error(`Document ${id} not found`);
      }
      
      const doc = JSON.parse(existingDoc as string) as VectorDocument;
      
      // Generate new embedding for compressed content
      const vector = await this.embeddingService.embed(content);
      
      // Update document
      doc.content = content;
      doc.vector = vector;
      doc.metadata = {
        ...doc.metadata,
        ...additionalMetadata
      };
      
      // Store updated document
      await this.redis.call('JSON.SET', key, '$', JSON.stringify(doc));
      
      this.logger.debug(`Updated document ${id} with compressed content`);
    } catch (error) {
      this.logger.error(`Failed to update document ${id}:`, error);
      throw error;
    }
  }

  async search(
    query: string,
    filters: {
      sessionId?: string;
      phase?: string;
      modelId?: string;
    } = {},
    topK: number = 5
  ): Promise<SearchResult[]> {
    if (!this.indexCreated) {
      this.logger.warn('Vector index not available, falling back to basic search');
      return [];
    }

    try {
      // Generate query embedding
      const queryVector = await this.embeddingService.embed(query);
      
      // Build filter query
      const filterParts: string[] = [];
      if (filters.sessionId) {
        filterParts.push(`@sessionId:{${filters.sessionId.replace(/[^a-zA-Z0-9]/g, '_')}}`);
      }
      if (filters.phase) {
        filterParts.push(`@phase:{${filters.phase}}`);
      }
      if (filters.modelId) {
        filterParts.push(`@modelId:{${filters.modelId.replace(/[^a-zA-Z0-9]/g, '_')}}`);
      }
      
      // Build the query - KNN syntax requires parentheses around filters
      let vectorQuery: string;
      if (filterParts.length > 0) {
        const filterQuery = `(${filterParts.join(' ')})`;
        vectorQuery = `${filterQuery}=>[KNN ${topK} @vector $vec AS vector_score]`;
      } else {
        vectorQuery = `*=>[KNN ${topK} @vector $vec AS vector_score]`;
      }
      
      // Convert vector to bytes for Redis
      const vecBytes = Buffer.from(new Float32Array(queryVector).buffer);
      
      // Execute search
      const rawResults = await this.redis.call(
        'FT.SEARCH',
        this.indexName,
        vectorQuery,
        'PARAMS', '2', 'vec', vecBytes,
        'RETURN', '3', '$.content', '$.metadata', 'vector_score',
        'DIALECT', '2'
      );
      
      // Safely parse results with type checking
      const searchResults: SearchResult[] = [];
      
      if (!Array.isArray(rawResults) || rawResults.length === 0) {
        this.logger.warn('Invalid Redis search response format');
        return searchResults;
      }
      
      // First element is the total count
      const totalCount = typeof rawResults[0] === 'number' ? rawResults[0] : 0;
      
      // Process each result pair (document key + fields)
      for (let i = 1; i < rawResults.length; i += 2) {
        const docKey = rawResults[i];
        const fields = rawResults[i + 1];
        
        // Validate document key
        if (typeof docKey !== 'string') {
          this.logger.warn(`Invalid document key at index ${i}:`, docKey);
          continue;
        }
        
        // Parse fields returned by Redis
        let content = '';
        let metadata: Record<string, unknown> = {};
        let score = 0;
        
        if (Array.isArray(fields)) {
          for (let j = 0; j < fields.length; j += 2) {
            const fieldName = fields[j];
            const fieldValue = fields[j + 1];
            
            if (typeof fieldName !== 'string') continue;
            
            if (fieldName === '$.content' && typeof fieldValue === 'string') {
              content = fieldValue;
            } else if (fieldName === '$.metadata' && fieldValue) {
              try {
                metadata = typeof fieldValue === 'string' ? JSON.parse(fieldValue) : fieldValue;
              } catch (error) {
                this.logger.warn('Failed to parse metadata:', error);
                metadata = {};
              }
            } else if (fieldName === 'vector_score' && typeof fieldValue === 'string') {
              // Convert distance to similarity: For COSINE distance, 0 = identical, 2 = opposite
              // Convert to similarity score where 1 = identical, 0 = opposite
              const distance = parseFloat(fieldValue);
              if (!isNaN(distance)) {
                score = Math.max(0, 1 - (distance / 2));
              }
            }
          }
        }
        
        searchResults.push({
          id: docKey.replace(this.keyPrefix, ''),
          content,
          score,
          metadata,
        });
      }
      
      return searchResults;
    } catch (error) {
      this.logger.error('Failed to search documents:', error);
      return [];
    }
  }

  async getRelevantExchanges(
    sessionId: string,
    _currentPhase: string,
    modelId: string,
    query: string,
    limit: number = config.context.relevantExchanges
  ): Promise<Array<{ phase: string; modelId: string; content: string }>> {
    try {
      // Search for relevant content from BOTH models
      const results = await this.search(
        query,
        { sessionId },
        limit * 2 // Get more results to filter
      );
      
      // Separate results by model
      const ownResults = results.filter(r => r.metadata.modelId === modelId);
      const otherModelResults = results.filter(r => r.metadata.modelId !== modelId);
      
      // Get the most relevant exchanges
      const exchanges: Array<{ phase: string; modelId: string; content: string }> = [];
      
      // Add own model's relevant content
      ownResults.slice(0, limit).forEach(result => {
        exchanges.push({
          phase: result.metadata.phase as string,
          modelId: result.metadata.modelId as string,
          content: result.content,
        });
      });
      
      // Add other model's relevant content
      otherModelResults.slice(0, limit).forEach(result => {
        exchanges.push({
          phase: result.metadata.phase as string,
          modelId: result.metadata.modelId as string,
          content: result.content,
        });
      });
      
      return exchanges;
    } catch (error) {
      this.logger.error('Failed to get relevant exchanges:', error);
      return [];
    }
  }

  async deleteSession(sessionId: string): Promise<void> {
    if (!this.indexCreated) return;
    
    try {
      // Search for all documents in this session
      const results = await this.redis.call(
        'FT.SEARCH',
        this.indexName,
        `@sessionId:{${sessionId.replace(/[^a-zA-Z0-9]/g, '_')}}`,
        'LIMIT', '0', '1000'
      ) as unknown[];
      
      // Delete each document
      const pipeline = this.redis.pipeline();
      for (let i = 1; i < results.length; i += 2) {
        const docKey = results[i] as string;
        pipeline.call('JSON.DEL', docKey);
      }
      
      await pipeline.exec();
      this.logger.info(`Deleted ${(results.length - 1) / 2} documents for session ${sessionId}`);
    } catch (error) {
      this.logger.error('Failed to delete session documents:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      // Drop the index
      if (this.indexCreated) {
        await this.redis.call('FT.DROPINDEX', this.indexName, 'DD');
        this.indexCreated = false;
      }
    } catch (error) {
      this.logger.error('Failed to clear vector store:', error);
    }
  }
}