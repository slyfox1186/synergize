import { ModelService } from './modelService.js';
import { RedisService } from './redisService.js';
import { PromptFormatter } from './promptFormatter.js';
import { TokenCounter } from './tokenCounter.js';
import { createLogger } from '../utils/logger.js';
import { CollaborationPhase } from '../models/types.js';
import { ConversationTurn } from '../models/conversationTypes.js';
import { LlamaChatSession } from 'node-llama-cpp';
import crypto from 'crypto';

/**
 * LLM Analytics Service - Intelligent data operations toolkit
 * 
 * Provides reusable LLM-powered functions for:
 * - Query enhancement (HyDE) - generateHypotheticalDocument()
 * - Document re-ranking - rerankDocuments()
 * - Context extraction - extractSharedContext()
 * - Intelligent summarization - createSynthesisSummary()
 * 
 * All methods are actively used by ConversationStateManager.
 * All operations are cached in Redis for performance.
 */
export class LLMAnalyticsService {
  private readonly logger = createLogger('LLMAnalytics');
  private readonly CACHE_TTL = 3600; // 1 hour cache
  private readonly GEMMA_MODEL_ID = 'gemma-3-12b-it-q4-0';
  private readonly tokenCounter: TokenCounter;

  constructor(
    private modelService: ModelService,
    private redisService: RedisService
  ) {
    this.tokenCounter = new TokenCounter();
  }

  /**
   * Generate cache key from inputs using SHA256
   */
  private generateCacheKey(operation: string, ...inputs: string[]): string {
    const combined = `${operation}:${inputs.join(':')}`;
    return `llm-analytics:${crypto.createHash('sha256').update(combined).digest('hex')}`;
  }

  /**
   * Try to get cached result
   */
  private async getCached<T>(key: string): Promise<T | null> {
    try {
      const cached = await this.redisService.getClient().get(key);
      if (cached) {
        this.logger.debug(`🎯 Cache hit for ${key}`);
        return JSON.parse(cached);
      }
    } catch (error) {
      this.logger.warn('Cache retrieval error:', { error });
    }
    return null;
  }

  /**
   * Cache result with TTL
   */
  private async cacheResult<T>(key: string, result: T): Promise<void> {
    try {
      await this.redisService.getClient().setex(
        key,
        this.CACHE_TTL,
        JSON.stringify(result)
      );
      this.logger.debug(`💾 Cached result for ${key}`);
    } catch (error) {
      this.logger.warn('Cache storage error:', { error });
    }
  }

  /**
   * Generate a hypothetical document (HyDE) to improve vector search
   */
  async generateHypotheticalDocument(
    query: string, 
    context?: string,
    phase?: CollaborationPhase
  ): Promise<string> {
    const cacheKey = this.generateCacheKey('hyde', query, context || '', phase || '');
    
    // Check cache first
    const cached = await this.getCached<string>(cacheKey);
    if (cached) return cached;

    try {
      const prompt = `You are a search optimization expert. Generate a hypothetical ideal answer document for the following query.

**Query:** ${query}
${context ? `\n**Context:** ${context}` : ''}
${phase ? `\n**Current Phase:** ${phase}` : ''}

**Your Task:**
Generate a comprehensive document that would be the PERFECT match for this query. Include:
1. The exact answer or solution being sought
2. Related concepts and terminology
3. Key phrases that would appear in the ideal response
4. Technical details if applicable

Make the document rich with relevant keywords while remaining natural and coherent.
Aim for 150-200 words.`;

      const result = await this.executeLLMTask(prompt, 300);
      await this.cacheResult(cacheKey, result);
      
      this.logger.info(`🔍 Generated HyDE document for query: "${query.substring(0, 50)}..."`);
      return result;
    } catch (error) {
      this.logger.error('HyDE generation failed:', error);
      return query; // Fallback to original query
    }
  }

  /**
   * Re-rank documents based on relevance to query
   */
  async rerankDocuments(
    query: string,
    documents: { id: string; content: string }[],
    topK: number = 5
  ): Promise<{ id: string; score: number; reason?: string }[]> {
    if (documents.length === 0) return [];
    
    const cacheKey = this.generateCacheKey(
      'rerank', 
      query, 
      documents.map(d => d.id).join(',')
    );
    
    const cached = await this.getCached<{ id: string; score: number; reason?: string }[]>(cacheKey);
    if (cached) return cached;

    try {
      // Process in batches if needed
      const batchSize = 5;
      const allScores: { id: string; score: number; reason?: string }[] = [];
      
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        
        const prompt = `You are a relevance scoring expert. Score each document's relevance to the query.

**Query:** ${query}

**Documents to Score:**
${batch.map((doc, idx) => `
Document ${idx + 1} (ID: ${doc.id}):
${this.tokenCounter.truncateToTokenLimit(doc.content, 200)}
`).join('\n')}

**Your Task:**
For each document, provide a relevance score from 0.0 to 1.0 and a brief reason.
Return ONLY a JSON array in this format:
[
  {"id": "doc_id", "score": 0.85, "reason": "Contains exact answer"},
  {"id": "doc_id", "score": 0.45, "reason": "Related but not specific"}
]

Focus on:
- Direct relevance to the query
- Quality of information
- Specificity of answer
- Recency/phase of information`;

        const response = await this.executeLLMTask(prompt, 400);
        
        // Parse JSON response
        try {
          const jsonMatch = response.match(/\[[\s\S]*\]/)?.[0];
          this.logger.debug('🔍 Rerank response JSON match:', { jsonMatch, fullResponse: response.substring(0, 200) });
          
          if (!jsonMatch) {
            throw new Error('No JSON array found in response');
          }
          
          const parsed = JSON.parse(jsonMatch);
          
          if (!Array.isArray(parsed)) {
            throw new Error('Parsed result is not an array');
          }
          
          // Validate each item has required properties
          const validScores = parsed.filter(item => 
            item && typeof item.id === 'string' && typeof item.score === 'number'
          );
          
          this.logger.debug('🔍 Valid scores parsed:', { count: validScores.length, total: parsed.length });
          allScores.push(...validScores);
          
        } catch (parseError) {
          this.logger.error('Failed to parse reranking response:', { 
            error: parseError, 
            response: response.substring(0, 500),
            batch: batch.map(d => d.id)
          });
          
          // Fallback scoring
          batch.forEach((doc, idx) => {
            allScores.push({
              id: doc.id,
              score: 1 - (idx * 0.1), // Simple decay
              reason: 'Fallback scoring due to parse error'
            });
          });
        }
      }
      
      // Sort by score and take top K
      const rankedResults = allScores
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);
      
      await this.cacheResult(cacheKey, rankedResults);
      
      this.logger.info(`📊 Re-ranked ${documents.length} documents, selected top ${rankedResults.length}`);
      return rankedResults;
    } catch (error) {
      this.logger.error('Document re-ranking failed:', error);
      // Fallback: return documents in original order with decay scores
      return documents.slice(0, topK).map((doc, idx) => ({
        id: doc.id,
        score: 1 - (idx * 0.1),
        reason: 'Fallback scoring due to error'
      }));
    }
  }

  /**
   * Extract shared context (agreements, disagreements, questions) from turns
   */
  async extractSharedContext(
    turnA: ConversationTurn,
    turnB: ConversationTurn
  ): Promise<{
    agreements: string[];
    disagreements: string[];
    newQuestions: string[];
    keyInsights: string[];
  }> {
    const cacheKey = this.generateCacheKey('shared-context', turnA.id, turnB.id);
    
    const cached = await this.getCached<{
      agreements: string[];
      disagreements: string[];
      newQuestions: string[];
      keyInsights: string[];
    }>(cacheKey);
    if (cached) return cached;

    try {
      const prompt = `You are an expert at analyzing AI collaboration. Extract key information from these two model responses.

**${turnA.modelId} Response (${turnA.phase}):**
${this.tokenCounter.truncateToTokenLimit(turnA.content, 400)}

**${turnB.modelId} Response (${turnB.phase}):**
${this.tokenCounter.truncateToTokenLimit(turnB.content, 400)}

**Your Task:**
Analyze both responses and extract:
1. Points of agreement (shared conclusions, similar approaches)
2. Points of disagreement (conflicting ideas, different methods)
3. New questions raised by either model
4. Key insights that advance the solution

Return ONLY a JSON object in this exact format:
{
  "agreements": ["point 1", "point 2"],
  "disagreements": ["conflict 1", "conflict 2"],
  "newQuestions": ["question 1", "question 2"],
  "keyInsights": ["insight 1", "insight 2"]
}

Be concise - each item should be a single, clear statement.`;

      const response = await this.executeLLMTask(prompt, 500);
      
      // Parse JSON response
      let result = {
        agreements: [] as string[],
        disagreements: [] as string[],
        newQuestions: [] as string[],
        keyInsights: [] as string[]
      };
      
      try {
        const parsed = JSON.parse(response.match(/\{[\s\S]*\}/)?.[0] || '{}');
        result = {
          agreements: parsed.agreements || [],
          disagreements: parsed.disagreements || [],
          newQuestions: parsed.newQuestions || [],
          keyInsights: parsed.keyInsights || []
        };
      } catch (parseError) {
        this.logger.warn('Failed to parse shared context response');
      }
      
      await this.cacheResult(cacheKey, result);
      
      this.logger.info(`🤝 Extracted shared context: ${result.agreements.length} agreements, ${result.disagreements.length} disagreements`);
      return result;
    } catch (error) {
      this.logger.error('Shared context extraction failed:', error);
      return {
        agreements: [],
        disagreements: [],
        newQuestions: [],
        keyInsights: []
      };
    }
  }

  /**
   * Create an intelligent summary optimized for synthesis
   */
  async createSynthesisSummary(
    turns: ConversationTurn[],
    originalQuery: string,
    targetTokens: number = 300
  ): Promise<string> {
    const cacheKey = this.generateCacheKey(
      'synthesis-summary',
      originalQuery,
      turns.map(t => t.id).join(','),
      targetTokens.toString()
    );
    
    const cached = await this.getCached<string>(cacheKey);
    if (cached) return cached;

    try {
      const prompt = `You are a summarization expert preparing content for final synthesis.

**Original Query:** ${originalQuery}

**Conversation Turns to Summarize:**
${turns.map(turn => `
### ${turn.modelId} (${turn.phase}):
${this.tokenCounter.truncateToTokenLimit(turn.content, 300)}
`).join('\n')}

**Your Task:**
Create a concise, information-dense summary optimized for synthesis that includes:
1. The final answer(s) with specific values
2. Key reasoning steps and methodology
3. Verification results and confidence levels
4. Points of consensus between models
5. Any important caveats or edge cases

**Format Requirements:**
- Target length: ${targetTokens} tokens (approximately ${Math.floor(targetTokens * 0.75)} words)
- Use bullet points for clarity
- Emphasize concrete values and conclusions
- Include confidence indicators

Generate the summary:`;

      const result = await this.executeLLMTask(prompt, targetTokens + 100);
      await this.cacheResult(cacheKey, result);
      
      this.logger.info(`📝 Created synthesis summary (${this.tokenCounter.countTokens(result)} tokens)`);
      return result;
    } catch (error) {
      this.logger.error('Synthesis summary creation failed:', error);
      // Fallback to simple concatenation
      return turns.map(t => 
        `${t.modelId}: ${this.tokenCounter.truncateToTokenLimit(t.content, 100)}...`
      ).join('\n\n');
    }
  }

  /**
   * Execute LLM task with proper error handling
   */
  private async executeLLMTask(prompt: string, maxTokens: number): Promise<string> {
    const context = await this.modelService.acquireContext(this.GEMMA_MODEL_ID);
    
    try {
      const modelConfig = this.modelService.getModelConfig(this.GEMMA_MODEL_ID);
      if (!modelConfig) throw new Error('Gemma model not found');

      const formatted = PromptFormatter.formatPrompt(
        modelConfig,
        'You are an AI assistant specialized in data analysis and optimization.',
        prompt
      );

      const sequence = context.getSequence();
      try {
        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt: ''
        });

        const response = await session.prompt(formatted.prompt, {
          temperature: 0.3, // Low temperature for consistency
          maxTokens
        });

        return response.trim();
      } finally {
        sequence.dispose();
      }
    } finally {
      this.modelService.releaseContext(this.GEMMA_MODEL_ID, context);
    }
  }
}