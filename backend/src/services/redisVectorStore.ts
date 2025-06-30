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
      // CRITICAL FIX: Drop and recreate index to ensure correct schema
      // This was the root cause of TAG search returning 0 results
      try {
        this.logger.info('🔧 Dropping existing index to ensure correct schema...');
        await this.redis.call('FT.DROPINDEX', this.indexName, 'DD'); // DD = also delete documents
        this.logger.info('✅ Successfully dropped existing index');
      } catch (error) {
        // Index doesn't exist, which is fine - we'll create it
        this.logger.info('No existing index to drop, proceeding with creation');
      }

      // Create the index with vector field and TAG fields
      const dimension = config.vectorStore.embeddingDimension;
      
      this.logger.info(`🔧 Creating new vector index ${this.indexName} with TAG fields...`);
      
      await this.redis.call(
        'FT.CREATE',
        this.indexName,
        'ON', 'JSON',
        'PREFIX', '1', this.keyPrefix,
        'SCHEMA',
        '$.content', 'AS', 'content', 'TEXT',
        '$.metadata.sessionId', 'AS', 'sessionId', 'TAG',
        '$.metadata.phase', 'AS', 'phase', 'TAG',
        '$.metadata.modelId', 'AS', 'modelId', 'TAG',
        '$.metadata.timestamp', 'AS', 'timestamp', 'NUMERIC', 'SORTABLE',
        '$.metadata.tokens', 'AS', 'tokens', 'NUMERIC',
        '$.vector', 'AS', 'vector', 'VECTOR', 'FLAT', '6',
        'TYPE', 'FLOAT32',
        'DIM', dimension.toString(),
        'DISTANCE_METRIC', 'COSINE'
      );

      this.indexCreated = true;
      this.logger.info(`✅ Created vector index ${this.indexName} with dimension ${dimension} and TAG fields: sessionId, phase, modelId`);
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
      // VERBOSE LOGGING: Show raw input
      this.logger.info(`🔵 STORING DOCUMENT - RAW INPUT`, {
        id,
        metadata: {
          sessionId: metadata.sessionId,
          phase: metadata.phase,
          modelId: metadata.modelId,
          timestamp: metadata.timestamp,
          tokens: metadata.tokens
        },
        contentPreview: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
        contentLength: content.length
      });

      // Generate embedding
      const vector = await this.embeddingService.embed(content);
      
      // VERBOSE LOGGING: Show vector details
      this.logger.info(`🟢 EMBEDDING GENERATED`, {
        id,
        vectorLength: vector.length,
        vectorSample: vector.slice(0, 5),
        vectorMagnitude: Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0)),
        vectorStats: {
          min: Math.min(...vector),
          max: Math.max(...vector),
          avg: vector.reduce((sum, val) => sum + val, 0) / vector.length
        }
      });
      
      // Create document (store metadata as-is, escaping happens during query)
      const doc: VectorDocument = {
        id,
        content,
        vector,
        metadata,
      };
      
      // Store as JSON
      const key = `${this.keyPrefix}${id}`;
      
      // VERBOSE LOGGING: Show what we're storing
      this.logger.info(`🟡 STORING TO REDIS`, {
        key,
        documentStructure: {
          hasId: doc.id !== undefined && doc.id !== null,
          hasContent: doc.content !== undefined && doc.content !== null,
          hasVector: Array.isArray(doc.vector),
          hasMetadata: doc.metadata !== undefined && doc.metadata !== null,
          metadataKeys: Object.keys(doc.metadata)
        }
      });
      
      await this.redis.call(
        'JSON.SET',
        key,
        '$',
        JSON.stringify(doc)
      );
      
      // DEBUGGING: Verify the document was stored correctly
      try {
        const storedDoc = await this.redis.call('JSON.GET', key);
        const parsedDoc = JSON.parse(storedDoc as string);
        
        // VERBOSE LOGGING: Show what Redis actually stored
        this.logger.info(`✅ DOCUMENT STORED - REDIS VERIFICATION`, {
          id,
          key,
          redisResponse: {
            hasContent: parsedDoc.content !== undefined && parsedDoc.content !== null,
            contentMatches: parsedDoc.content === content,
            hasVector: Array.isArray(parsedDoc.vector),
            vectorLength: parsedDoc.vector?.length,
            vectorSample: parsedDoc.vector?.slice(0, 5),
            metadata: parsedDoc.metadata,
            metadataMatches: JSON.stringify(parsedDoc.metadata) === JSON.stringify(metadata)
          }
        });
      } catch (error) {
        this.logger.error(`❌ FAILED TO VERIFY STORED DOCUMENT`, { id, error });
      }
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
      
      // Update document (store metadata as-is, escaping happens during query)
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
      // VERBOSE LOGGING: Show search input
      this.logger.info(`🔵 VECTOR SEARCH - RAW INPUT`, {
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        queryLength: query.length,
        filters: filters,
        topK
      });

      // Generate query embedding
      const queryVector = await this.embeddingService.embed(query);
      
      // VERBOSE LOGGING: Show query vector details
      this.logger.info(`🟢 QUERY EMBEDDING GENERATED`, {
        vectorLength: queryVector.length,
        vectorSample: queryVector.slice(0, 5),
        vectorMagnitude: Math.sqrt(queryVector.reduce((sum, val) => sum + val * val, 0)),
        vectorStats: {
          min: Math.min(...queryVector),
          max: Math.max(...queryVector),
          avg: queryVector.reduce((sum, val) => sum + val, 0) / queryVector.length
        }
      });
      
      // Build filter query with properly escaped values for TAG fields
      const filterParts: string[] = [];
      if (filters.sessionId) {
        // For TAG fields, we need to escape special characters
        // Single backslash is needed for Redis TAG query escaping
        const escapedSessionId = filters.sessionId.replace(/-/g, '\\-');
        filterParts.push(`@sessionId:{${escapedSessionId}}`);
        
        // VERBOSE LOGGING: Show filter transformation
        this.logger.info(`🟡 FILTER TRANSFORMATION - sessionId`, {
          original: filters.sessionId,
          escaped: escapedSessionId,
          filterPart: `@sessionId:{${escapedSessionId}}`,
          rawFilterPart: String.raw`@sessionId:{${escapedSessionId}}`
        });
      }
      if (filters.phase) {
        filterParts.push(`@phase:{${filters.phase}}`);
      }
      if (filters.modelId) {
        // Single backslash is needed for Redis TAG query escaping
        const escapedModelId = filters.modelId.replace(/-/g, '\\-');
        filterParts.push(`@modelId:{${escapedModelId}}`);
        
        // VERBOSE LOGGING: Show filter transformation
        this.logger.info(`🟡 FILTER TRANSFORMATION - modelId`, {
          original: filters.modelId,
          escaped: escapedModelId,
          filterPart: `@modelId:{${escapedModelId}}`,
          rawFilterPart: String.raw`@modelId:{${escapedModelId}}`
        });
      }
      
      // Build the query - Redis vector search syntax per official docs
      let vectorQuery: string;
      if (filterParts.length > 0) {
        // Multi-field filters use space-separated AND logic
        const filterQuery = `(${filterParts.join(' ')})`;
        vectorQuery = `${filterQuery}=>[KNN ${topK} @vector $vec AS vector_score]`;
      } else {
        // No filters - search all vectors  
        vectorQuery = `(*)=>[KNN ${topK} @vector $vec AS vector_score]`;
      }
      
      // Convert vector to bytes for Redis
      const vecBytes = Buffer.from(new Float32Array(queryVector).buffer);
      
      // VERBOSE LOGGING: Show final query
      this.logger.info(`🔴 EXECUTING REDIS SEARCH`, {
        indexName: this.indexName,
        vectorQuery,
        filterParts,
        vecBytesLength: vecBytes.length,
        dialect: 2
      });

      // DEBUGGING: Check if index exists and get info
      try {
        const indexInfo = await this.redis.call('FT.INFO', this.indexName);
        this.logger.info(`📊 INDEX INFO BEFORE SEARCH`, { indexInfo });
      } catch (error) {
        this.logger.error(`❌ INDEX MISSING!`, { indexName: this.indexName, error });
        return [];
      }

      // DEBUGGING: Check total document count
      try {
        const totalDocs = await this.redis.call('FT.SEARCH', this.indexName, '*', 'LIMIT', '0', '0');
        this.logger.info(`📊 TOTAL DOCUMENTS IN INDEX`, { 
          indexName: this.indexName,
          totalCount: Array.isArray(totalDocs) ? totalDocs[0] : 'unknown'
        });
      } catch (error) {
        this.logger.error(`❌ FAILED TO COUNT DOCUMENTS`, { error });
      }
      
      const rawResults = await this.redis.call(
        'FT.SEARCH',
        this.indexName,
        vectorQuery,
        'PARAMS', '2', 'vec', vecBytes,
        'RETURN', '3', 'content', '$.metadata', 'vector_score',
        'DIALECT', '2'
      );
      
      // Debug logging for raw results
      this.logger.debug(`🔍 Redis search raw results`, {
        resultType: Array.isArray(rawResults) ? 'array' : typeof rawResults,
        resultLength: Array.isArray(rawResults) ? rawResults.length : 'N/A',
        firstElement: Array.isArray(rawResults) && rawResults.length > 0 ? rawResults[0] : 'empty'
      });
      
      // Also check if ANY documents exist for this session (without vector search)
      if (filters.sessionId) {
        try {
          const escapedSessionId = filters.sessionId.replace(/-/g, '\\-');
          const tagQuery = `@sessionId:{${escapedSessionId}}`;
          const simpleSearchResults = await this.redis.call(
            'FT.SEARCH',
            this.indexName,
            tagQuery,
            'LIMIT', '0', '5'
          );
          this.logger.debug(`🔍 Simple TAG search results for session`, {
            sessionId: filters.sessionId,
            escapedSessionId,
            query: tagQuery,
            resultCount: Array.isArray(simpleSearchResults) ? (simpleSearchResults.length - 1) / 2 : 0
          });
        } catch (error) {
          this.logger.warn('Simple TAG search failed', { error });
        }
      }
      
      // Safely parse results with type checking
      const searchResults: SearchResult[] = [];
      
      if (!Array.isArray(rawResults) || rawResults.length === 0) {
        this.logger.warn('Invalid Redis search response format');
        return searchResults;
      }
      
      // First element is the total count (not used but part of Redis response format)
      
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
            
            if (fieldName === 'content' && typeof fieldValue === 'string') {
              content = fieldValue;
            } else if (fieldName === '$.metadata' && fieldValue) {
              try {
                metadata = typeof fieldValue === 'string' ? JSON.parse(fieldValue) : fieldValue;
              } catch (error) {
                this.logger.warn('Failed to parse metadata:', { error });
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
      const escapedSessionId = sessionId.replace(/-/g, '\\-');
      const results = await this.redis.call(
        'FT.SEARCH',
        this.indexName,
        `@sessionId:{${escapedSessionId}}`,
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

  // REMOVED: escapeTagValue() function - replaced with cleaner quoted syntax for DIALECT 2
  // Example: @sessionId:{'value'} instead of @sessionId:{escaped\-value}
}