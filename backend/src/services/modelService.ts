import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { getLlama, LlamaModel, LlamaContext, LlamaContextOptions, Llama } from 'node-llama-cpp';

import { ModelConfig } from '../models/types.js';
import { createLogger } from '../utils/logger.js';
import { config } from '../config.js';
import { MODEL_DEFAULTS } from '../constants/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ModelInstance {
  config: ModelConfig;
  model: LlamaModel;
  availableContexts: LlamaContext[];
  busyContexts: Set<LlamaContext>;
}

/**
 * PROFESSIONAL MODEL SERVICE WITH DIRECT CONTEXT MANAGEMENT
 * 
 * Handles model loading, context pool management, and acquisition/release
 * without external dependencies. Built for high-performance collaboration.
 */
export class ModelService {
  private readonly models = new Map<string, ModelConfig>();
  private readonly modelInstances = new Map<string, ModelInstance>();
  private readonly modelsPath: string;
  private readonly logger = createLogger('ModelService');
  private llama: Llama | null = null;

  constructor() {
    this.modelsPath = path.join(__dirname, config.paths.modelsDirectory);
  }

  async initialize(): Promise<void> {
    try {
      // Initialize LLama library
      this.llama = await getLlama();
      this.logger.info('🦙 LLama library initialized', {
        gpuLayers: config.model.gpuLayers,
        modelsPath: this.modelsPath
      });

      // Ensure models directory exists
      await fs.mkdir(this.modelsPath, { recursive: true });
      
      // Scan for GGUF models
      await this.scanForModels();
      
      // Load each model and create context pools
      for (const [modelId, modelConfig] of this.models) {
        await this.loadModel(modelId, modelConfig);
      }
      
      this.logger.info(`✅ Model service initialized`, {
        totalModels: this.models.size,
        totalContexts: this.models.size * config.model.contextsPerModel,
        contextConfig: {
          contextSize: config.model.contextSize,
          batchSize: config.model.batchSize,
          contextsPerModel: config.model.contextsPerModel,
          threads: config.model.threads
        }
      });
    } catch (error) {
      this.logger.error('Failed to initialize model service:', error);
      throw error;
    }
  }

  private async loadModel(modelId: string, modelConfig: ModelConfig): Promise<void> {
    const loadStartTime = Date.now();
    const fileStats = await fs.stat(modelConfig.path);
    const fileSizeMB = Math.round(fileStats.size / 1024 / 1024);
    
    try {
      this.logger.info(`🔄 Loading model`, {
        modelId,
        modelName: modelConfig.name,
        modelPath: modelConfig.path,
        fileSizeMB,
        contextSize: modelConfig.contextSize
      });

      if (!this.llama) {
        throw new Error('Llama library not initialized');
      }

      // Load the model with correct parameters
      const model = await this.llama.loadModel({
        modelPath: modelConfig.path,
        gpuLayers: config.model.gpuLayers,
      });

      // Create context pool for this model
      const availableContexts: LlamaContext[] = [];
      const busyContexts = new Set<LlamaContext>();

      // Pre-create contexts for better performance
      for (let i = 0; i < config.model.contextsPerModel; i++) {
        const contextOptions: LlamaContextOptions = {
          contextSize: modelConfig.contextSize,
          batchSize: config.model.batchSize,
          threads: config.model.threads,
        };
        
        const context = await model.createContext(contextOptions);
        availableContexts.push(context);
      }

      const modelInstance: ModelInstance = {
        config: modelConfig,
        model,
        availableContexts,
        busyContexts,
      };

      this.modelInstances.set(modelId, modelInstance);
      
      const loadTimeMs = Date.now() - loadStartTime;
      const memoryUsage = process.memoryUsage();
      
      this.logger.info(`✅ Model loaded successfully`, {
        modelId,
        modelName: modelConfig.name,
        loadTimeMs,
        contextPoolSize: availableContexts.length,
        memoryUsage: {
          heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          externalMB: Math.round(memoryUsage.external / 1024 / 1024)
        }
      });

    } catch (error) {
      this.logger.error(`Failed to load model ${modelId}:`, error);
      throw error;
    }
  }

  async scanForModels(): Promise<void> {
    try {
      const files = await fs.readdir(this.modelsPath);
      const ggufFiles = files.filter(f => f.endsWith('.gguf'));
      
      for (const file of ggufFiles) {
        const modelPath = path.join(this.modelsPath, file);
        const modelName = path.basename(file, '.gguf');
        
        // Detect model type from filename
        const modelConfig: ModelConfig = {
          id: modelName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
          name: modelName,
          path: modelPath,
          contextSize: config.model.contextSize,
          settings: this.getModelSettings(modelName),
        };
        
        this.models.set(modelConfig.id, modelConfig);
        this.logger.info(`📦 Found model: ${modelConfig.name} (${modelConfig.id})`);
      }
      
      if (this.models.size === 0) {
        this.logger.warn('⚠️  No GGUF models found in models directory');
      }
    } catch (error) {
      this.logger.error('Error scanning for models:', error);
      throw error;
    }
  }

  private getModelSettings(modelName: string): ModelConfig['settings'] {
    // Customize settings based on model type
    if (modelName.toLowerCase().includes('qwen')) {
      return {
        temperature: 0.7,
        topP: 0.8,
        topK: 20,
        minP: 0,
        repeatPenalty: 1.1,
      };
    } else if (modelName.toLowerCase().includes('gemma')) {
      return {
        temperature: 1.0,
        topP: 0.95,
        topK: 64,
        minP: 0.0,
        repeatPenalty: 1.0,
      };
    }
    
    // Default settings
    return {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      repeatPenalty: 1.1,
    };
  }

  async getAvailableModels(): Promise<ModelConfig[]> {
    return Array.from(this.models.values());
  }

  /**
   * ACQUIRE CONTEXT FOR MODEL GENERATION
   * 
   * Professional context management with automatic availability checking
   */
  async acquireContext(modelId: string): Promise<LlamaContext> {
    const modelInstance = this.modelInstances.get(modelId);
    if (!modelInstance) {
      throw new Error(`Model ${modelId} not found or not loaded`);
    }

    // Check for available context
    if (modelInstance.availableContexts.length === 0) {
      // Wait for a context to become available
      await this.waitForAvailableContext(modelId);
    }

    const context = modelInstance.availableContexts.pop();
    if (!context) {
      throw new Error(`No contexts available for model ${modelId}`);
    }

    modelInstance.busyContexts.add(context);
    
    this.logger.info(`📤 Context acquired`, {
      modelId,
      availableContexts: modelInstance.availableContexts.length,
      busyContexts: modelInstance.busyContexts.size,
      totalContexts: config.model.contextsPerModel,
      utilizationPercent: Math.round((modelInstance.busyContexts.size / config.model.contextsPerModel) * 100)
    });
    return context;
  }

  /**
   * RELEASE CONTEXT BACK TO POOL
   */
  releaseContext(modelId: string, context: LlamaContext): void {
    const modelInstance = this.modelInstances.get(modelId);
    if (!modelInstance) {
      this.logger.warn(`Attempted to release context for unknown model: ${modelId}`);
      return;
    }

    if (modelInstance.busyContexts.has(context)) {
      modelInstance.busyContexts.delete(context);
      modelInstance.availableContexts.push(context);
      
      this.logger.debug(`📥 Released context for ${modelId} (${modelInstance.availableContexts.length} available)`);
    } else {
      this.logger.warn(`Attempted to release context not acquired from ${modelId}`);
    }
  }

  /**
   * Check if a model is loaded and available (for health checks)
   */
  isModelLoaded(modelId: string): boolean {
    const modelInstance = this.modelInstances.get(modelId);
    return modelInstance !== undefined && modelInstance.availableContexts.length > 0;
  }

  /**
   * WAIT FOR AVAILABLE CONTEXT - Fixed to prevent resource leaks
   */
  private async waitForAvailableContext(modelId: string, timeoutMs: number = MODEL_DEFAULTS.CONTEXT_WAIT_TIMEOUT): Promise<void> {
    const startTime = Date.now();
    const checkInterval = MODEL_DEFAULTS.CONTEXT_CHECK_INTERVAL;
    
    while (Date.now() - startTime < timeoutMs) {
      const modelInstance = this.modelInstances.get(modelId);
      
      // Check if model was removed (edge case)
      if (!modelInstance) {
        throw new Error(`Model ${modelId} no longer exists`);
      }
      
      // Check if context is available
      if (modelInstance.availableContexts.length > 0) {
        return; // Success!
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
    
    // Timeout reached
    throw new Error(`Timeout waiting for available context for model ${modelId} after ${timeoutMs}ms`);
  }

  getModelConfig(modelId: string): ModelConfig | undefined {
    return this.models.get(modelId);
  }

  /**
   * PROFESSIONAL SHUTDOWN WITH PROPER CLEANUP
   */
  async shutdown(): Promise<void> {
    this.logger.info('🔄 Shutting down model service...');

    for (const [modelId, modelInstance] of this.modelInstances) {
      try {
        // Dispose all contexts
        for (const context of modelInstance.availableContexts) {
          context.dispose();
        }
        
        for (const context of modelInstance.busyContexts) {
          context.dispose();
        }

        // Dispose model
        modelInstance.model.dispose();
        
        this.logger.info(`✅ Cleaned up model: ${modelId}`);
      } catch (error) {
        this.logger.error(`Error cleaning up model ${modelId}:`, error);
      }
    }

    this.modelInstances.clear();
    this.models.clear();
    
    this.logger.info('✅ Model service shutdown complete');
  }

  /**
   * GET LLAMA INSTANCE FOR GRAMMAR CREATION
   */
  getLlamaInstance(): Llama {
    if (!this.llama) {
      throw new Error('Llama instance not initialized. Call initialize() first.');
    }
    return this.llama;
  }
}