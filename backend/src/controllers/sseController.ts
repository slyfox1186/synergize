import { Request, Response } from 'express';

import { ModelService } from '../services/modelService.js';
import { RedisService } from '../services/redisService.js';
import { CollaborationOrchestrator } from '../services/collaborationOrchestrator.js';

import { SSEMessage, SSEMessageType } from '../models/types.js';
import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';

export class SSEController {
  private readonly activeConnections = new Map<string, Response>();
  private readonly heartbeatIntervals = new Map<string, NodeJS.Timeout>();
  private readonly logger = createLogger('SSEController');
  
  constructor(
    private readonly modelService: ModelService,
    private readonly redisService: RedisService
  ) {}

  async handleStream(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params;
    const clientIp = req.ip || req.connection.remoteAddress;
    const startTime = Date.now();
    
    // Validate session with strict timestamp checking
    const isValidSession = await this.validateSession(sessionId);
    if (!isValidSession) {
      this.logger.warn('Rejecting invalid or stale session connection', {
        sessionId,
        clientIp,
        reason: 'session_validation_failed'
      });
      res.status(410).json({ 
        error: 'Session invalid or expired. Please start a new collaboration.',
        sessionId 
      });
      return;
    }
    
    this.logger.info('SSE connection initiated', {
      sessionId,
      clientIp,
      userAgent: req.headers['user-agent'],
      activeConnections: this.activeConnections.size
    });
    
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable Nginx buffering
      'Access-Control-Allow-Origin': config.cors.origin,
    });

    // Store connection
    this.activeConnections.set(sessionId, res);
    
    this.logger.info('SSE connection established', {
      sessionId,
      totalActiveConnections: this.activeConnections.size,
      connectionDuration: Date.now() - startTime
    });

    // Send initial connection message
    this.sendMessage(res, {
      type: SSEMessageType.CONNECTION,
      payload: { status: 'connected', sessionId },
    });

    // Set up heartbeat
    const heartbeatInterval = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, config.sse.heartbeatInterval);
    
    this.heartbeatIntervals.set(sessionId, heartbeatInterval);

    // Initialize collaboration
    const orchestrator = new CollaborationOrchestrator(
      this.modelService,
      this.redisService,
      (message: SSEMessage) => this.sendMessage(res, message),
    );

    // Start collaboration
    this.logger.info('Starting collaboration', {
      sessionId,
      orchestratorInitialized: true
    });
    
    orchestrator.startCollaboration(sessionId).catch((error: Error) => {
      this.logger.error('Collaboration failed', error, {
        sessionId,
        connectionDuration: Date.now() - startTime
      });
      
      this.sendMessage(res, {
        type: SSEMessageType.ERROR,
        payload: { error: error.message },
      });
    });

    // Handle client disconnect
    req.on('close', () => {
      this.logger.info('SSE connection closed by client', {
        sessionId,
        connectionDuration: Date.now() - startTime,
        reason: 'client_disconnect'
      });
      this.cleanup(sessionId);
      orchestrator.cancel();
    });

    req.on('error', (error) => {
      this.logger.error('SSE connection error', error, {
        sessionId,
        connectionDuration: Date.now() - startTime,
        reason: 'connection_error'
      });
      this.cleanup(sessionId);
      orchestrator.cancel();
    });
  }

  /**
   * Validate session with strict timestamp checking to prevent stale session processing
   */
  private async validateSession(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await this.redisService.getSession(sessionId);
      
      if (!sessionData || typeof sessionData !== 'object') {
        this.logger.debug('Session validation failed: no session data', { sessionId });
        return false;
      }

      // Check if session has required createdAt timestamp
      if (!('createdAt' in sessionData)) {
        this.logger.debug('Session validation failed: missing createdAt timestamp', { sessionId });
        return false;
      }

      const session = sessionData as { createdAt: string };
      const sessionAge = Date.now() - new Date(session.createdAt).getTime();
      
      // Strict age limits: 1 minute in development, 5 minutes in production
      const maxAge = process.env.NODE_ENV === 'development' ? 60000 : 300000; // 1 min dev, 5 min prod
      const isValid = sessionAge <= maxAge;
      
      this.logger.info('Session validation completed', {
        sessionId,
        sessionAgeMs: sessionAge,
        maxAgeMs: maxAge,
        isValid,
        environment: process.env.NODE_ENV || 'development'
      });
      
      return isValid;
    } catch (error) {
      this.logger.error('Session validation error', error, { sessionId });
      return false;
    }
  }

  private sendMessage(res: Response, message: SSEMessage): void {
    const data = JSON.stringify(message);
    res.write(`data: ${data}\n\n`);
  }

  private cleanup(sessionId: string): void {
    // Clear heartbeat
    const interval = this.heartbeatIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.heartbeatIntervals.delete(sessionId);
    }

    // Remove connection
    const wasActive = this.activeConnections.has(sessionId);
    this.activeConnections.delete(sessionId);
    
    this.logger.info('SSE connection cleanup completed', {
      sessionId,
      wasActive,
      remainingConnections: this.activeConnections.size,
      hadHeartbeat: interval !== undefined
    });
  }
}