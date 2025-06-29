import { Request, Response } from 'express';

import { RedisService } from '../services/redisService.js';
import { ModelService } from '../services/modelService.js';
import { getErrorMessage } from '../utils/typeGuards.js';

interface HealthCheckUsage {
  heapUsed: string;
  heapTotal: string;
  percent: string;
}

interface HealthCheck {
  status: string;
  usage?: HealthCheckUsage;
  message?: string;
}

export function createHealthCheck(modelService: ModelService) {
  return async function healthCheck(_req: Request, res: Response): Promise<void> {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        memory: checkMemory(),
        redis: await checkRedis(),
        models: await checkModels(modelService),
      },
    };

    const overallStatus = Object.values(health.checks).every(check => check.status === 'ok') ? 200 : 503;
    res.status(overallStatus).json(health);
  };
}

function checkMemory(): HealthCheck {
  const usage = process.memoryUsage();
  const heapUsedPercent = (usage.heapUsed / usage.heapTotal) * 100;
  
  return {
    status: heapUsedPercent < 90 ? 'ok' : 'warning',
    usage: {
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      percent: `${heapUsedPercent.toFixed(1)}%`,
    },
  };
}

function checkRedis(): HealthCheck {
  try {
    // Redis service is a singleton, so this will use existing connection
    // Just instantiating to verify it exists
    new RedisService();
    return { status: 'ok' };
  } catch (error) {
    return { 
      status: 'error', 
      message: getErrorMessage(error),
    };
  }
}

async function checkModels(modelService: ModelService): Promise<HealthCheck> {
  try {
    const models = await modelService.getAvailableModels();
    
    if (models.length === 0) {
      return {
        status: 'loading',
        message: 'No models available yet',
      };
    }
    
    // Check if models are loaded by checking if we can acquire contexts
    // We'll use a simple approach: check if modelInstances exist
    let loadedCount = 0;
    for (const model of models) {
      try {
        // Try to acquire and immediately release a context to test if model is loaded
        const context = await modelService.acquireContext(model.id);
        modelService.releaseContext(model.id, context);
        loadedCount++;
      } catch (error) {
        // Model not loaded yet
      }
    }
    
    if (loadedCount === 0) {
      return {
        status: 'loading',
        message: `Models found: ${models.length}, loaded: 0`,
      };
    }
    
    return {
      status: 'ok',
      message: `Models loaded: ${loadedCount}/${models.length}`,
    };
  } catch (error) {
    return {
      status: 'error',
      message: getErrorMessage(error),
    };
  }
}