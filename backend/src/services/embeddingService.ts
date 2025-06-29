import { pipeline, env } from '@xenova/transformers';
import { createLogger } from '../utils/logger.js';

// Force CPU execution only
env.backends.onnx.wasm.numThreads = 4;
// Skip WebGPU configuration - not needed for CPU-only execution
env.allowRemoteModels = true;
env.localModelPath = './models/embeddings';

// Type for the embedder pipeline
type FeatureExtractionPipeline = {
  (texts: string | string[], options?: { pooling?: string; normalize?: boolean }): Promise<{ data: Float32Array }>;
};

export class EmbeddingService {
  private static instance: EmbeddingService | null = null;
  private embedder: FeatureExtractionPipeline | null = null;
  private readonly logger = createLogger('EmbeddingService');
  private initPromise: Promise<void> | null = null;

  constructor() {
    if (EmbeddingService.instance) {
      return EmbeddingService.instance;
    }
    EmbeddingService.instance = this;
  }

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize();
    return this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.logger.info('🔄 Initializing BGE embedding model (CPU only)...');
      
      // Load the BGE model for feature extraction
      this.embedder = await pipeline(
        'feature-extraction',
        'Xenova/bge-large-en-v1.5',
        {
          quantized: true, // Use quantized model for better CPU performance
        }
      ) as FeatureExtractionPipeline;
      
      this.logger.info('✅ BGE embedding model loaded successfully');
      
      // Test embedding
      await this.embed('test');
      this.logger.info('✅ Embedding service ready');
    } catch (error) {
      this.logger.error('Failed to initialize embedding service:', error);
      throw error;
    }
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embedder) {
      await this.initialize();
    }
    
    if (!this.embedder) {
      throw new Error('Embedder not initialized');
    }

    try {
      // Generate embeddings
      const output = await this.embedder(text, {
        pooling: 'mean',
        normalize: true,
      });
      
      // Convert to regular array
      return Array.from(output.data);
    } catch (error) {
      this.logger.error('Failed to generate embedding:', error);
      throw error;
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.embedder) {
      await this.initialize();
    }

    try {
      const embeddings: number[][] = [];
      
      // Process in batches to avoid memory issues
      const batchSize = 8;
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchEmbeddings = await Promise.all(
          batch.map(text => this.embed(text))
        );
        embeddings.push(...batchEmbeddings);
      }
      
      return embeddings;
    } catch (error) {
      this.logger.error('Failed to generate batch embeddings:', error);
      throw error;
    }
  }

  getEmbeddingDimension(): number {
    // BGE-large-en-v1.5 produces 1024-dimensional embeddings
    return 1024;
  }

  async shutdown(): Promise<void> {
    this.embedder = null;
    this.initPromise = null;
  }
}