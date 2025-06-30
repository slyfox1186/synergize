/**
 * REACT AGREEMENT ANALYSIS SERVICE - INTELLIGENT LLM-DRIVEN ANALYSIS
 * 
 * Revolutionary agreement analysis using the ReAct (Reasoning + Acting) pattern.
 * Gemma LLM acts as the intelligence engine, dynamically choosing which analysis
 * tools to use and interpreting results to make sophisticated agreement decisions.
 */

import { ModelService } from './modelService.js';
import { AnalysisToolbox, ToolResult } from './analysisToolbox.js';
import { ContextAllocator } from './contextAllocator.js';
import { TokenCounter } from './tokenCounter.js';
import { LlamaChatSession } from 'node-llama-cpp';
import { createLogger } from '../utils/logger.js';
import {
  AgreementAnalysisInput,
  AgreementAnalysisResult,
  ExtractedData,
  AgreementLevel
} from '../models/agreementAnalysisTypes.js';
import { CollaborationPhase, SSEMessage, SSEMessageType } from '../models/types.js';

export interface ReActState {
  sessionId: string;
  iteration: number;
  maxIterations: number;
  scratchpad: string;
  extractionA: ExtractedData | null;
  extractionB: ExtractedData | null;
  toolResults: Map<string, ToolResult>;
  finalDecision: {
    nextPhase: CollaborationPhase;
    reasoning: string;
    confidence: number;
    isPhaseJump: boolean;
    jumpReason?: string;
  } | null;
}

export interface ToolCall {
  tool: string;
  params: Record<string, unknown>;
  thought: string;
}

/**
 * ReAct-based agreement analysis engine powered by Gemma LLM
 */
export class ReActAgreementAnalysisService {
  private logger = createLogger('ReActAgreementAnalysisService');
  private toolbox: AnalysisToolbox;
  private contextAllocator: ContextAllocator;
  private tokenCounter: TokenCounter;
  private gemmaModelId = 'gemma-3-12b-it-q4-0';

  constructor(
    private modelService: ModelService,
    private sendMessage?: (message: SSEMessage) => void
  ) {
    this.toolbox = new AnalysisToolbox();
    this.tokenCounter = new TokenCounter();
    this.contextAllocator = new ContextAllocator(this.tokenCounter);
  }

  async initialize(): Promise<void> {
    await this.toolbox.initialize();
    this.logger.info('🤖 ReActAgreementAnalysisService initialized with intelligent LLM-driven analysis');
  }

  /**
   * MAIN ENTRY POINT: Analyze agreement using ReAct pattern
   */
  async analyze(input: AgreementAnalysisInput): Promise<AgreementAnalysisResult> {
    const startTime = Date.now();
    this.logger.info(`🚀 Starting ReAct agreement analysis for session ${input.sessionId}`);

    try {
      // Initialize ReAct state with intelligent summarization
      const state: ReActState = {
        sessionId: input.sessionId,
        iteration: 0,
        maxIterations: 6, // Sufficient for thorough analysis
        scratchpad: await this.initializeScratchpad(input),
        extractionA: null,
        extractionB: null,
        toolResults: new Map(),
        finalDecision: null
      };

      // Execute ReAct loop
      await this.executeReActLoop(input, state);

      // Build final result
      return this.buildFinalResult(input, state, startTime);

    } catch (error) {
      this.logger.error('❌ ReAct agreement analysis failed', { 
        error: error instanceof Error ? error.message : String(error),
        sessionId: input.sessionId
      });
      return this.createFailsafeResult(input, startTime);
    }
  }

  /**
   * Initialize the ReAct scratchpad with context
   * Uses intelligent summarization instead of crude truncation
   */
  private async initializeScratchpad(input: AgreementAnalysisInput): Promise<string> {
    // Use GEMMA to intelligently summarize responses if they're too long
    const targetSummaryTokens = 300;
    
    const summaryA = this.tokenCounter.countTokens(input.responseA.content) > targetSummaryTokens 
      ? await this.intelligentContentSummarization(input.responseA.content, targetSummaryTokens)
      : input.responseA.content;
      
    const summaryB = this.tokenCounter.countTokens(input.responseB.content) > targetSummaryTokens
      ? await this.intelligentContentSummarization(input.responseB.content, targetSummaryTokens)
      : input.responseB.content;

    return `AGREEMENT ANALYSIS TASK
======================

Original Query: ${input.originalQuery}
Current Phase: ${input.currentPhase}
Session: ${input.sessionId}

Model A (${input.responseA.modelId}) Response:
${summaryA}

Model B (${input.responseB.modelId}) Response:
${summaryB}

MISSION: Determine if both models agree sufficiently to jump directly to final phase or if further collaboration is needed.

ANALYSIS BEGINS:
`;
  }

  /**
   * Execute the ReAct reasoning and acting loop
   */
  private async executeReActLoop(input: AgreementAnalysisInput, state: ReActState): Promise<void> {
    // Send initial analysis start message
    this.sendStatusUpdate(`🔬 Starting ReAct agreement analysis...`);
    
    while (state.iteration < state.maxIterations && !state.finalDecision) {
      state.iteration++;
      
      this.logger.info(`🔄 ReAct iteration ${state.iteration}/${state.maxIterations}`);
      this.sendStatusUpdate(`🧠 ReAct Iteration ${state.iteration}: AI reasoning about agreement...`);

      // REASONING: Get next action from Gemma
      const action = await this.getNextActionFromLLM(input, state);
      
      if (!action) {
        this.logger.warn('⚠️ No action received from LLM, terminating loop');
        break;
      }

      // Log the thought process
      state.scratchpad += `\nIteration ${state.iteration}:\nThought: ${action.thought}\n`;

      // Check for final decision
      if (action.tool === 'finish') {
        this.logger.info('✅ LLM decided to finish analysis');
        
        // Properly convert LLM params to finalDecision with enum validation
        const params = action.params as Record<string, unknown>;
        const nextPhaseString = params.nextPhase as string;
        
        // Convert string to CollaborationPhase enum
        const nextPhase = Object.values(CollaborationPhase).includes(nextPhaseString as CollaborationPhase)
          ? nextPhaseString as CollaborationPhase
          : CollaborationPhase.CONSENSUS; // Fallback
        
        const finalDecision = {
          nextPhase,
          reasoning: (typeof params.reasoning === 'string' ? params.reasoning : undefined) || 'ReAct analysis complete',
          confidence: (typeof params.confidence === 'number' ? params.confidence : undefined) || 0.8,
          isPhaseJump: (typeof params.isPhaseJump === 'boolean' ? params.isPhaseJump : undefined) || false,
          jumpReason: typeof params.jumpReason === 'string' ? params.jumpReason : undefined
        };
        
        state.finalDecision = finalDecision;
        
        this.logger.info(`🎯 Final decision set: ${nextPhase} (jump: ${finalDecision.isPhaseJump})`);
        this.sendStatusUpdate(`🎯 Agreement analysis complete! Recommendation: ${nextPhase} ${finalDecision.isPhaseJump ? '(Phase Jump!)' : ''}`);
        state.scratchpad += `Action: finish\nDecision: ${JSON.stringify(state.finalDecision)}\n`;
        break;
      }

      // ACTING: Execute the chosen tool
      this.sendStatusUpdate(`🔧 Executing tool: ${this.getToolDescription(action.tool)}`);
      const result = await this.executeTool(action.tool, action.params, input, state);
      
      if (result) {
        state.toolResults.set(`${action.tool}_${state.iteration}`, result);
        state.scratchpad += `Action: ${action.tool}(${JSON.stringify(action.params)})\nObservation: ${result.reasoning}\n`;
        
        this.logger.info(`🔧 Tool executed: ${action.tool}`, {
          success: result.success,
          reasoning: result.reasoning.substring(0, 100)
        });
        
        this.sendStatusUpdate(`✅ ${this.getToolDescription(action.tool)} complete`);
      } else {
        state.scratchpad += `Action: ${action.tool}(${JSON.stringify(action.params)})\nObservation: Tool execution failed\n`;
        this.sendStatusUpdate(`❌ Tool execution failed: ${action.tool}`);
      }
    }

    // Ensure we have a decision
    if (!state.finalDecision) {
      this.logger.warn('⚠️ ReAct loop completed without final decision, generating fallback');
      state.finalDecision = this.generateFallbackDecision(input, state);
    }
  }

  /**
   * Get next action from Gemma LLM using ReAct prompting
   */
  private async getNextActionFromLLM(input: AgreementAnalysisInput, state: ReActState): Promise<ToolCall | null> {
    let context = null;
    try {
      context = await this.modelService.acquireContext(this.gemmaModelId);
      const sequence = context.getSequence();
      
      try {
        // Create JSON schema for structured tool calling
        const llama = this.modelService.getLlamaInstance();
        const actionSchema = {
          type: "object" as const,
          properties: {
            thought: {
              type: "string" as const,
              description: "Your reasoning about what to do next"
            },
            tool: {
              type: "string" as const,
              enum: ["extract_data", "compare_answers", "analyze_confidence", "compare_reasoning", "assess_errors", "detect_phase_signals", "finish"] as const
            },
            params: {
              type: "object" as const,
              description: "Parameters for the chosen tool"
            }
          },
          required: ["thought", "tool", "params"] as const
        };
        
        const grammar = await llama.createGrammarForJsonSchema(actionSchema);
        
        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt: this.buildSystemPrompt()
        });

        const prompt = this.buildReActPrompt(input, state);
        
        // Use sophisticated token allocation for ReAct reasoning
        const modelConfig = this.modelService.getModelConfig(this.gemmaModelId);
        if (!modelConfig) {
          throw new Error(`Model config not found for ${this.gemmaModelId}`);
        }
        const allocation = this.contextAllocator.calculateAllocation(
          CollaborationPhase.CRITIQUE,
          modelConfig.contextSize,
          state.scratchpad,
          this.gemmaModelId,
          'react_analysis',
          state.iteration
        );

        const response = await session.prompt(prompt, {
          grammar,
          temperature: 0.2, // Low temperature for consistent reasoning
          maxTokens: allocation.maxGenerationTokens - this.tokenCounter.countTokens(prompt) - 100
        });

        const action = JSON.parse(response) as ToolCall;
        
        this.logger.info('🧠 LLM action received', {
          tool: action.tool,
          thought: action.thought.substring(0, 100)
        });

        return action;
        
      } finally {
        sequence.dispose();
      }
    } catch (error) {
      this.logger.error('❌ Failed to get action from LLM', { error });
      return null;
    } finally {
      if (context) {
        this.modelService.releaseContext(this.gemmaModelId, context);
      }
    }
  }

  /**
   * Build comprehensive system prompt for ReAct analysis
   */
  private buildSystemPrompt(): string {
    return `You are an expert AI collaboration analyst using the ReAct framework. Your mission is to determine if two AI models agree sufficiently to skip directly to the final answer phase.

AVAILABLE TOOLS:
1. extract_data: Extract structured data from model responses
   - Use FIRST to get structured data from both responses
   - Params: {} (extracts from both models automatically)

2. compare_answers: Compare final answers between models
   - Use after data extraction to check answer agreement
   - Params: {} (uses previously extracted data)

3. analyze_confidence: Analyze confidence levels of both models
   - Determines if models are confident enough for phase jumping
   - Params: {} (uses previously extracted data)

4. compare_reasoning: Compare reasoning paths and logical flow
   - Checks if models used similar or complementary approaches
   - Params: {} (uses previously extracted data)

5. assess_errors: Evaluate error flags and critical issues
   - Identifies any errors that would prevent agreement
   - Params: {} (uses previously extracted data)

6. detect_phase_signals: Detect explicit phase jump suggestions
   - Looks for "jump to consensus" type signals in responses
   - Params: {} (analyzes original response content)

7. finish: Provide final recommendation
   - Use when you have enough information to make a decision
   - Params: { nextPhase: "COMPLETE"|"CONSENSUS"|"CRITIQUE"|"REVISE", reasoning: string, confidence: number, isPhaseJump: boolean, jumpReason?: string }

DECISION LOGIC:
- If both models have EXACT_MATCH answers with HIGH confidence and NO errors → jump to COMPLETE
- If models have equivalent answers with good confidence → jump to CONSENSUS  
- If explicit phase jump signals detected from both models → consider phase jump
- If significant disagreement or errors → continue with CRITIQUE or REVISE

IMPORTANT: 
1. Start with extract_data (no parameters needed - extracts both models)
2. Then use comparison tools to analyze agreement
3. If both models agree with high confidence, jump to COMPLETE
4. If disagreement or low confidence, continue current phase

WORKFLOW: extract_data → compare_answers → analyze_confidence → finish`;
  }

  /**
   * Build the ReAct prompt with current state
   */
  private buildReActPrompt(_input: AgreementAnalysisInput, state: ReActState): string {
    let availableTools = "All tools available";
    let nextAction = "Choose the most appropriate tool";
    
    // Adjust available tools based on current state
    if (!state.extractionA || !state.extractionB) {
      availableTools = "Use extract_data first to analyze both model responses";
      nextAction = "Start with: {\"thought\": \"I need to extract data from both models first\", \"tool\": \"extract_data\", \"params\": {}}";
    } else if (state.toolResults.size <= 1) {
      availableTools = "Data extracted, now compare the models";
      nextAction = "Use compare_answers or analyze_confidence to check agreement";
    } else {
      availableTools = "Multiple analyses complete, ready to decide";
      nextAction = "Use finish to provide final recommendation";
    }

    return `${state.scratchpad}

Current Status: ${availableTools}
Iteration: ${state.iteration}/${state.maxIterations}
Data Status: extractionA=${state.extractionA ? 'ready' : 'missing'}, extractionB=${state.extractionB ? 'ready' : 'missing'}

What should I do next to determine if the models agree sufficiently for a phase jump?

${nextAction}

Response format: {"thought": "...", "tool": "...", "params": {...}}`;
  }

  /**
   * Execute the chosen analysis tool
   */
  private async executeTool(toolName: string, params: Record<string, unknown>, input: AgreementAnalysisInput, state: ReActState): Promise<ToolResult | null> {
    try {
      switch (toolName) {
        case 'extract_data':
          return await this.executeDataExtraction(params, input, state);
          
        case 'compare_answers':
          if (state.extractionA && state.extractionB) {
            return await this.toolbox.compareFinalAnswers(state.extractionA, state.extractionB);
          }
          return { success: false, data: null, reasoning: 'Data not extracted yet' };
          
        case 'analyze_confidence':
          if (state.extractionA && state.extractionB) {
            return await this.toolbox.analyzeConfidenceLevels(state.extractionA, state.extractionB);
          }
          return { success: false, data: null, reasoning: 'Data not extracted yet' };
          
        case 'compare_reasoning':
          if (state.extractionA && state.extractionB) {
            return await this.toolbox.compareReasoningPaths(state.extractionA, state.extractionB);
          }
          return { success: false, data: null, reasoning: 'Data not extracted yet' };
          
        case 'assess_errors':
          if (state.extractionA && state.extractionB) {
            return await this.toolbox.assessErrorFlags(state.extractionA, state.extractionB);
          }
          return { success: false, data: null, reasoning: 'Data not extracted yet' };
          
        case 'detect_phase_signals':
          return await this.toolbox.detectPhaseJumpSignals(
            input.responseA.content,
            input.responseB.content
          );
          
        default:
          return { success: false, data: null, reasoning: `Unknown tool: ${toolName}` };
      }
    } catch (error) {
      this.logger.error(`❌ Tool execution failed: ${toolName}`, { error });
      return { success: false, data: null, reasoning: `Tool execution error: ${error}` };
    }
  }

  /**
   * Execute data extraction for a specific model
   */
  private async executeDataExtraction(params: Record<string, unknown>, input: AgreementAnalysisInput, state: ReActState): Promise<ToolResult> {
    // Handle missing model parameter - extract both if not specified
    const model = params.model as 'A' | 'B' | undefined;
    
    if (!model || (model !== 'A' && model !== 'B')) {
      // Extract both models if parameter is missing or invalid
      const extractionA = await this.extractAllDataWithLLM(input.responseA.content);
      const extractionB = await this.extractAllDataWithLLM(input.responseB.content);
      
      state.extractionA = extractionA;
      state.extractionB = extractionB;
      
      return {
        success: true,
        data: { extractionA, extractionB },
        reasoning: `Extracted data from both models: A="${extractionA.finalAnswer}" (conf=${extractionA.confidenceScore}), B="${extractionB.finalAnswer}" (conf=${extractionB.confidenceScore})`
      };
    }
    
    const response = model === 'A' ? input.responseA : input.responseB;
    const extractedData = await this.extractAllDataWithLLM(response.content);
    
    if (model === 'A') {
      state.extractionA = extractedData;
    } else {
      state.extractionB = extractedData;
    }
    
    return {
      success: true,
      data: extractedData,
      reasoning: `Extracted data from Model ${model}: answer="${extractedData.finalAnswer}", confidence=${extractedData.confidenceScore}, hasAnswer=${extractedData.hasExplicitAnswer}`
    };
  }

  /**
   * LLM-based data extraction (reused from original service)
   */
  private async extractAllDataWithLLM(content: string): Promise<ExtractedData> {
    let context = null;
    try {
      context = await this.modelService.acquireContext(this.gemmaModelId);
      const sequence = context.getSequence();
      
      try {
        const llama = this.modelService.getLlamaInstance();
        const extractionSchema = {
          type: "object" as const,
          properties: {
            finalAnswer: {
              oneOf: [
                { type: "string" as const },
                { type: "number" as const },
                { type: "null" as const }
              ]
            },
            confidenceScore: {
              type: "number" as const,
              minimum: 0,
              maximum: 1
            },
            confidenceKeywords: {
              type: "array" as const,
              items: { type: "string" as const }
            },
            reasoningSteps: {
              type: "array" as const,
              items: { type: "string" as const }
            },
            errorFlags: {
              type: "array" as const, 
              items: { type: "string" as const }
            },
            hasExplicitAnswer: {
              type: "boolean" as const
            },
            answerLocation: {
              type: "string" as const
            }
          },
          required: ["finalAnswer", "confidenceScore", "confidenceKeywords", "reasoningSteps", "errorFlags", "hasExplicitAnswer", "answerLocation"] as const
        };
        
        const grammar = await llama.createGrammarForJsonSchema(extractionSchema);
        
        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt: 'You are an expert at finding final answers in mathematical text. Extract numerical values from phrases like "Final Answer:", "The sum is", "The answer is", or "= X". DO NOT return null if a FINAL ANSWER is present!'
        });

        // Calculate how much content we can process based on context allocation
        const modelConfig = this.modelService.getModelConfig(this.gemmaModelId);
        if (!modelConfig) {
          throw new Error(`Model config not found for ${this.gemmaModelId}`);
        }
        const allocation = this.contextAllocator.calculateAllocation(
          CollaborationPhase.CRITIQUE, // Using CRITIQUE phase for analysis
          modelConfig.contextSize,
          '', // No history for data extraction
          this.gemmaModelId,
          'analysis',
          1
        );

        // If content exceeds available space, use GEMMA to intelligently summarize
        const contentTokens = this.tokenCounter.countTokens(content);
        const availableContentTokens = allocation.maxGenerationTokens - 200; // Reserve space for response
        
        let processedContent = content;
        if (contentTokens > availableContentTokens) {
          this.logger.info(`📄 Content too large (${contentTokens} tokens), using GEMMA for intelligent summarization`);
          processedContent = await this.intelligentContentSummarization(content, availableContentTokens);
        }

        const prompt = `Find the final numerical answer in this text:

"${processedContent}"

Look for these EXACT phrases and extract the number:
- "Final Answer: 11" → extract 11
- "The sum is 11" → extract 11  
- "answer is 42" → extract 42
- "= 263" → extract 263

If you see ANY final numerical conclusion, extract it as finalAnswer.
If there is NO clear final number, set finalAnswer to null.

Return JSON with:
- finalAnswer: the number (or null)
- confidenceScore: 0.0-1.0
- confidenceKeywords: array of confidence words
- reasoningSteps: array of reasoning steps  
- errorFlags: array of errors mentioned
- hasExplicitAnswer: true if final answer exists
- answerLocation: where you found it`;

        const response = await session.prompt(prompt, {
          grammar,
          temperature: 0.3, // Higher temp for better extraction
          maxTokens: allocation.maxGenerationTokens - this.tokenCounter.countTokens(prompt) - 100 // Dynamic allocation minus prompt minus safety margin
        });

        return JSON.parse(response) as ExtractedData;
        
      } finally {
        sequence.dispose();
      }
    } catch (error) {
      this.logger.warn('⚠️ LLM data extraction failed', { error });
      return {
        finalAnswer: null,
        confidenceScore: 0.5,
        confidenceKeywords: [],
        reasoningSteps: [],
        errorFlags: ['Extraction failed'],
        hasExplicitAnswer: false,
        answerLocation: ''
      };
    } finally {
      if (context) {
        this.modelService.releaseContext(this.gemmaModelId, context);
      }
    }
  }

  /**
   * Generate fallback decision when ReAct loop doesn't complete
   */
  private generateFallbackDecision(input: AgreementAnalysisInput, state: ReActState): NonNullable<ReActState['finalDecision']> {
    this.logger.warn('🔄 Generating fallback decision');
    
    // Simple heuristic based on available data
    if (state.extractionA && state.extractionB) {
      const answersMatch = state.extractionA.finalAnswer === state.extractionB.finalAnswer;
      const bothHaveAnswers = state.extractionA.hasExplicitAnswer && state.extractionB.hasExplicitAnswer;
      const averageConfidence = (state.extractionA.confidenceScore + state.extractionB.confidenceScore) / 2;
      
      if (answersMatch && bothHaveAnswers && averageConfidence > 0.8) {
        return {
          nextPhase: CollaborationPhase.CONSENSUS,
          reasoning: 'Fallback decision: Models appear to agree on answer with good confidence',
          confidence: averageConfidence,
          isPhaseJump: true,
          jumpReason: 'Detected agreement via fallback heuristic'
        };
      }
    }
    
    return {
      nextPhase: input.currentPhase,
      reasoning: 'Fallback decision: Insufficient data for agreement determination',
      confidence: 0.5,
      isPhaseJump: false
    };
  }

  /**
   * Build final comprehensive result
   */
  private buildFinalResult(input: AgreementAnalysisInput, state: ReActState, startTime: number): AgreementAnalysisResult {
    const decision = state.finalDecision ?? this.generateFallbackDecision(input, state);
    
    // Determine agreement level
    let agreementLevel: AgreementLevel = 'INSUFFICIENT_DATA';
    if (state.extractionA && state.extractionB) {
      if (state.extractionA.finalAnswer === state.extractionB.finalAnswer && state.extractionA.finalAnswer !== null) {
        const avgConfidence = (state.extractionA.confidenceScore + state.extractionB.confidenceScore) / 2;
        agreementLevel = avgConfidence > 0.8 ? 'PERFECT_CONSENSUS' : 'STRONG_AGREEMENT';
      } else if (state.extractionA.finalAnswer !== state.extractionB.finalAnswer) {
        agreementLevel = 'CONFLICTED';
      }
    }

    return {
      sessionId: input.sessionId,
      analysisTimestamp: Date.now(),
      processingTimeMs: Date.now() - startTime,
      
      extractionA: state.extractionA || this.createEmptyExtraction(),
      extractionB: state.extractionB || this.createEmptyExtraction(),
      
      semanticAnalysis: {
        overallSimilarity: 0.5, // Simplified for ReAct version
        reasoningStepSimilarity: {},
        topicClusters: []
      },
      
      agreementLevel,
      finalRecommendation: decision,
      
      keyFindings: {
        agreements: decision.isPhaseJump ? ['Models show sufficient agreement for phase jump'] : [],
        conflicts: [],
        complementaryIdeas: [],
        criticalIssues: []
      },
      
      analysisQuality: {
        dataCompleteness: state.extractionA && state.extractionB ? 1.0 : 0.5,
        confidenceInRecommendation: decision.confidence,
        stageUsed: 'LLM_ARBITER' // ReAct is LLM-driven
      }
    };
  }

  /**
   * Create empty extraction for fallback
   */
  private createEmptyExtraction(): ExtractedData {
    return {
      finalAnswer: null,
      confidenceScore: 0,
      confidenceKeywords: [],
      reasoningSteps: [],
      errorFlags: ['Analysis incomplete'],
      hasExplicitAnswer: false,
      answerLocation: ''
    };
  }


  /**
   * INTELLIGENT CONTENT SUMMARIZATION using GEMMA LLM
   * Instead of crude truncation, use AI to extract key information
   */
  private async intelligentContentSummarization(content: string, targetTokens: number): Promise<string> {
    let context = null;
    try {
      context = await this.modelService.acquireContext(this.gemmaModelId);
      const sequence = context.getSequence();
      
      try {
        const session = new LlamaChatSession({
          contextSequence: sequence,
          systemPrompt: 'You are an expert at summarizing mathematical text while preserving ALL final answers, conclusions, and key calculations. Extract the essential information concisely.'
        });

        const prompt = `Summarize this mathematical text, keeping ALL final answers, conclusions, and key calculations:

"${content}"

Target length: approximately ${targetTokens} tokens
CRITICAL: Preserve any "Final Answer:", "The sum is", "= X" statements exactly as written.`;

        const summary = await session.prompt(prompt, {
          temperature: 0.1,
          maxTokens: targetTokens
        });

        this.logger.info(`✅ Intelligent summarization: ${this.tokenCounter.countTokens(content)} → ${this.tokenCounter.countTokens(summary)} tokens`);
        return summary;

      } finally {
        sequence.dispose();
      }
    } catch (error) {
      this.logger.warn('⚠️ Intelligent summarization failed, using token-based truncation', { error });
      return this.tokenCounter.truncateToTokenLimit(content, targetTokens);
    } finally {
      if (context) {
        this.modelService.releaseContext(this.gemmaModelId, context);
      }
    }
  }

  /**
   * Create failsafe result when analysis completely fails
   */
  private createFailsafeResult(input: AgreementAnalysisInput, startTime: number): AgreementAnalysisResult {
    const emptyExtraction = this.createEmptyExtraction();

    return {
      sessionId: input.sessionId,
      analysisTimestamp: Date.now(),
      processingTimeMs: Date.now() - startTime,
      
      extractionA: emptyExtraction,
      extractionB: emptyExtraction,
      
      semanticAnalysis: {
        overallSimilarity: 0,
        reasoningStepSimilarity: {},
        topicClusters: []
      },
      
      agreementLevel: 'INSUFFICIENT_DATA',
      finalRecommendation: {
        nextPhase: input.currentPhase,
        reasoning: 'ReAct analysis failed - continuing current phase',
        confidence: 0,
        isPhaseJump: false
      },
      
      keyFindings: {
        agreements: [],
        conflicts: [],
        complementaryIdeas: [],
        criticalIssues: ['ReAct agreement analysis service encountered an error']
      },
      
      analysisQuality: {
        dataCompleteness: 0,
        confidenceInRecommendation: 0,
        stageUsed: 'LLM_ARBITER'
      }
    };
  }

  /**
   * Send status update to frontend
   */
  private sendStatusUpdate(message: string): void {
    if (this.sendMessage) {
      this.sendMessage({
        type: SSEMessageType.MODEL_STATUS,
        payload: {
          sessionId: '',
          status: 'REACT_ANALYSIS',
          message,
          timestamp: Date.now()
        }
      });
    }
  }

  /**
   * Get human-readable description of tool
   */
  private getToolDescription(tool: string): string {
    const descriptions: Record<string, string> = {
      'extract_data': 'Extracting final answers and confidence from both models',
      'compare_answers': 'Comparing final answers between models',
      'analyze_confidence': 'Analyzing confidence levels of both models',
      'compare_reasoning': 'Comparing reasoning paths and logical flow',
      'assess_errors': 'Evaluating error flags and critical issues',
      'detect_phase_signals': 'Detecting explicit phase jump suggestions',
      'finish': 'Making final agreement recommendation'
    };
    return descriptions[tool] || `Executing ${tool}`;
  }
}