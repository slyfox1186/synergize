import { Request, Response } from 'express';

import { RedisService } from '../services/redisService.js';
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

export async function healthCheck(_req: Request, res: Response): Promise<void> {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      memory: checkMemory(),
      redis: await checkRedis(),
    },
  };

  const overallStatus = Object.values(health.checks).every(check => check.status === 'ok') ? 200 : 503;
  res.status(overallStatus).json(health);
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