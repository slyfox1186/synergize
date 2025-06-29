import { ConversationStateManager } from './conversationStateManager.js';
import { ModelService } from './modelService.js';
import { PromptFormatter } from './promptFormatter.js';
import { createLogger } from '../utils/logger.js';
import { CollaborationPhase } from '../models/types.js';
import { ConversationTurn, ConversationState } from '../models/conversationTypes.js';
import { 
  CurationTaskType, 
  CurationResult,
  ModelRole
} from '../models/curatedConversationTypes.js';
import { LlamaContext, LlamaChatSession } from 'node-llama-cpp';

/**
 * Handles conversation curation where Gemma enhances data between turns
 */
export class ConversationCurator {
  private conversationManager: ConversationStateManager;
  private modelService?: ModelService;
  private readonly logger = createLogger('ConversationCurator');

  constructor(conversationManager: ConversationStateManager, modelService?: ModelService) {
    this.conversationManager = conversationManager;
    this.modelService = modelService;
  }

  /**
   * Curate a turn's content to enhance it for the next participant
   */
  async curateTurn(
    sessionId: string,
    targetTurnId: string,
    curatorModelId: string,
    curationTasks: CurationTaskType[]
  ): Promise<CurationResult> {
    this.logger.info(`🎨 Starting curation of turn ${targetTurnId} by ${curatorModelId}`);

    // Get the turn to curate and conversation context
    const conversationState = await this.conversationManager.getConversationState(sessionId);
    if (!conversationState) throw new Error(`Conversation ${sessionId} not found`);

    const targetTurn = conversationState.turns.find(t => t.id === targetTurnId);
    if (!targetTurn) throw new Error(`Turn ${targetTurnId} not found`);

    // Build curation prompt based on tasks
    this.buildCurationPrompt(
      targetTurn,
      conversationState,
      curationTasks
    );

    // This would be sent to the curator model (Gemma)
    // For now, return the prompt that would generate the curation
    const curationResult: CurationResult = {
      originalTurnId: targetTurnId,
      enhancedContent: this.generateMockEnhancement(targetTurn.content, curationTasks),
      extractedInsights: this.extractInsights(targetTurn.content),
      contextUpdates: {
        newKeyPoints: this.extractKeyPoints(targetTurn.content),
        clarifiedAgreements: [],
        identifiedGaps: this.identifyGaps(targetTurn.content),
        strengthenedArguments: []
      },
      recommendedNextSteps: this.generateNextSteps(targetTurn.content, conversationState.currentPhase),
      curationNotes: `Enhanced by ${curatorModelId} for clarity and context integration`,
      confidence: 0.85
    };

    this.logger.info(`✨ Curation complete for turn ${targetTurnId}`);
    return curationResult;
  }

  /**
   * Generate curation prompt for the curator model
   */
  buildCurationPrompt(
    targetTurn: ConversationTurn,
    conversationState: ConversationState,
    tasks: CurationTaskType[]
  ): string {
    const taskDescriptions = this.getTaskDescriptions(tasks);
    
    let prompt = `You are the conversation curator for this collaborative discussion. Your role is to enhance and optimize the conversation data to improve understanding and flow.

**Original Query:** ${conversationState.originalQuery}
**Current Phase:** ${conversationState.currentPhase}
**Turn to Enhance:** ${targetTurn.modelId} (Turn ${targetTurn.turnNumber})

**Conversation Context:**
`;

    // Add recent conversation history
    const recentTurns = conversationState.turns.slice(-3);
    for (const turn of recentTurns) {
      if (turn.id === targetTurn.id) {
        prompt += `➤ **[TARGET]** ${turn.modelId}: ${turn.content}\n\n`;
      } else {
        prompt += `${turn.modelId}: ${turn.content.substring(0, 150)}...\n\n`;
      }
    }

    prompt += `**Shared Understanding So Far:**
`;
    if (conversationState.sharedContext.agreements.length > 0) {
      prompt += `• Agreements: ${conversationState.sharedContext.agreements.slice(-3).join('; ')}\n`;
    }
    if (conversationState.sharedContext.keyPoints.length > 0) {
      prompt += `• Key Points: ${conversationState.sharedContext.keyPoints.slice(-5).join('; ')}\n`;
    }

    prompt += `

**Your Curation Tasks:**
${taskDescriptions}

**Output Format:**
Please provide your curation as a structured response:

1. **Enhanced Content:** [Improved version of the target response]
2. **Key Insights:** [Bullet points of main insights extracted]
3. **Context Updates:** [What should be added to shared understanding]
4. **Identified Gaps:** [Missing information or weak reasoning]
5. **Next Steps:** [Recommendations for continuing the conversation]
6. **Curation Notes:** [Your thoughts on the improvements made]

Focus on making the conversation more productive and insightful for the next participant.

Begin your curation:`;

    return prompt;
  }

  /**
   * Create optimized conversation flow with curation steps
   */
  createGemmaCuratedFlow(
    _sessionId: string,
    gemmaModelId: string,
    qwenModelId: string,
    phase: CollaborationPhase
  ): { step: string; action: string; modelId: string; role: ModelRole }[] {
    
    const baseFlow = [
      {
        step: "1. Initial Response",
        action: "RESPOND",
        modelId: gemmaModelId,
        role: ModelRole.PARTICIPANT
      },
      {
        step: "2. Partner Response", 
        action: "RESPOND",
        modelId: qwenModelId,
        role: ModelRole.PARTICIPANT
      },
      {
        step: "3. Curate Partner's Response",
        action: "CURATE",
        modelId: gemmaModelId,
        role: ModelRole.CURATOR
      },
      {
        step: "4. Enhanced Follow-up",
        action: "RESPOND", 
        modelId: gemmaModelId,
        role: ModelRole.PARTICIPANT
      }
    ];

    // Customize curation focus based on phase
    const phaseFocus = this.getPhaseCurationFocus(phase);
    this.logger.info(`🎯 Flow created for ${phase} with curation focus: ${phaseFocus.join(', ')}`);

    return baseFlow;
  }

  /**
   * Determine which curation tasks to apply based on conversation phase
   */
  getPhaseCurationFocus(phase: CollaborationPhase): CurationTaskType[] {
    const focusMap: Record<CollaborationPhase, CurationTaskType[]> = {
      [CollaborationPhase.BRAINSTORM]: [
        CurationTaskType.EXTRACT_KEY_POINTS,
        CurationTaskType.CONNECT_IDEAS,
        CurationTaskType.IDENTIFY_GAPS
      ],
      [CollaborationPhase.CRITIQUE]: [
        CurationTaskType.STRENGTHEN_ARGUMENTS,
        CurationTaskType.ENHANCE_CLARITY,
        CurationTaskType.IDENTIFY_GAPS
      ],
      [CollaborationPhase.REVISE]: [
        CurationTaskType.SIMPLIFY_COMPLEXITY,
        CurationTaskType.CONNECT_IDEAS,
        CurationTaskType.PREPARE_CONTEXT
      ],
      [CollaborationPhase.SYNTHESIZE]: [
        CurationTaskType.CONNECT_IDEAS,
        CurationTaskType.ENHANCE_CLARITY,
        CurationTaskType.PREPARE_CONTEXT
      ],
      [CollaborationPhase.CONSENSUS]: [
        CurationTaskType.STRENGTHEN_ARGUMENTS,
        CurationTaskType.ENHANCE_CLARITY
      ],
      [CollaborationPhase.IDLE]: [CurationTaskType.PREPARE_CONTEXT],
      [CollaborationPhase.COMPLETE]: [CurationTaskType.ENHANCE_CLARITY]
    };

    return focusMap[phase] || [CurationTaskType.ENHANCE_CLARITY];
  }

  private getTaskDescriptions(tasks: CurationTaskType[]): string {
    const descriptions: Record<CurationTaskType, string> = {
      [CurationTaskType.ENHANCE_CLARITY]: "• Make the response clearer, more focused, and easier to understand",
      [CurationTaskType.EXTRACT_KEY_POINTS]: "• Identify and highlight the most important insights and ideas",
      [CurationTaskType.IDENTIFY_GAPS]: "• Find missing information, weak reasoning, or unexplored angles",
      [CurationTaskType.STRENGTHEN_ARGUMENTS]: "• Improve logical flow and add supporting evidence where needed",
      [CurationTaskType.SIMPLIFY_COMPLEXITY]: "• Break down complex ideas into more digestible components",
      [CurationTaskType.CONNECT_IDEAS]: "• Link this response to previous conversation points and themes",
      [CurationTaskType.PREPARE_CONTEXT]: "• Optimize the content for the next participant's understanding"
    };

    return tasks.map(task => descriptions[task]).join('\n');
  }

  private generateMockEnhancement(content: string, tasks: CurationTaskType[]): string {
    // This would be replaced by actual LLM-generated enhancement
    let enhanced = content;
    
    if (tasks.includes(CurationTaskType.ENHANCE_CLARITY)) {
      enhanced = `[ENHANCED FOR CLARITY] ${enhanced}`;
    }
    
    if (tasks.includes(CurationTaskType.CONNECT_IDEAS)) {
      enhanced += "\n\n[CURATOR NOTE: This connects to our earlier discussion about...]";
    }

    return enhanced;
  }

  private extractInsights(content: string): string[] {
    // Simple insight extraction - would be LLM-generated in real implementation
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 30);
    const insightKeywords = /(key|important|crucial|significant|main|primary|because|therefore|however)/i;
    
    return sentences
      .filter(s => insightKeywords.test(s))
      .map(s => s.trim())
      .slice(0, 3);
  }

  private extractKeyPoints(content: string): string[] {
    // Extract potential key points
    const points = content.match(/(?:^|\n)\s*[•\-*]\s*(.+)/g) || [];
    const sentences = content.split(/[.!?]+/).filter(s => s.length > 20);
    
    return [...points, ...sentences.slice(0, 2)].slice(0, 5);
  }

  private identifyGaps(content: string): string[] {
    // Simple gap identification logic
    const gaps = [];
    
    if (!content.includes('because') && !content.includes('therefore')) {
      gaps.push('Could benefit from more explicit reasoning');
    }
    
    if (content.length < 100) {
      gaps.push('Response seems brief - could be expanded');
    }
    
    if (!content.includes('example') && !content.includes('instance')) {
      gaps.push('Could use concrete examples or evidence');
    }

    return gaps;
  }

  private generateNextSteps(_content: string, phase: CollaborationPhase): string[] {
    const phaseSteps: Record<CollaborationPhase, string[]> = {
      [CollaborationPhase.BRAINSTORM]: [
        'Build on the creative ideas presented',
        'Add complementary perspectives',
        'Explore implementation feasibility'
      ],
      [CollaborationPhase.CRITIQUE]: [
        'Address the concerns raised',
        'Provide counter-evidence if available',
        'Identify areas for improvement'
      ],
      [CollaborationPhase.REVISE]: [
        'Integrate the feedback constructively',
        'Strengthen weak points identified',
        'Prepare for synthesis discussion'
      ],
      [CollaborationPhase.SYNTHESIZE]: [
        'Focus on common ground',
        'Integrate best elements from both perspectives',
        'Work toward unified solution'
      ],
      [CollaborationPhase.CONSENSUS]: [
        'Finalize the collaborative solution',
        'Ensure all key points are addressed',
        'Prepare comprehensive conclusion'
      ],
      [CollaborationPhase.IDLE]: ['Begin the collaboration'],
      [CollaborationPhase.COMPLETE]: ['Review final outcome']
    };

    return phaseSteps[phase] || ['Continue the discussion'];
  }

  /**
   * INTELLIGENT PHASE DECISION SYSTEM
   * 
   * Allows Gemma to decide whether to continue current phase or transition
   */
  async makePhaseDecision(
    sessionId: string,
    currentPhase: CollaborationPhase,
    qwenResponse: string,
    gemmaModelId: string
  ): Promise<{ shouldTransition: boolean; targetPhase?: CollaborationPhase; reasoning: string }> {
    this.logger.info(`🤔 Gemma making phase decision for ${currentPhase}`);

    // Get conversation context for decision making
    const conversationPrompt = await this.conversationManager.buildConversationPrompt(
      sessionId,
      gemmaModelId
    );

    const decisionPrompt = this.createPhaseDecisionPrompt(
      currentPhase,
      qwenResponse,
      conversationPrompt.conversationContext || ''
    );

    if (!this.modelService) {
      throw new Error('ModelService is required for phase decision making');
    }

    // Use Gemma to make the phase decision
    const context = await this.modelService.acquireContext(gemmaModelId);
    try {
      const decision = await this.generatePhaseDecision(
        gemmaModelId,
        context,
        decisionPrompt
      );

      this.logger.info(`📋 Phase decision: ${decision.shouldTransition ? `Transition to ${decision.targetPhase}` : 'Continue current phase'}`);
      return decision;

    } finally {
      this.modelService.releaseContext(gemmaModelId, context);
    }
  }

  /**
   * Create prompt for intelligent phase decision WITH VERIFICATION
   */
  private createPhaseDecisionPrompt(
    currentPhase: CollaborationPhase,
    qwenResponse: string,
    conversationContext: string
  ): string {
    return `You are making an intelligent decision about collaboration flow progression with VERIFICATION requirements.

**Current Phase:** ${currentPhase}

**Partner's Latest Response:**
${qwenResponse.substring(0, 500)}...

**Recent Conversation Context:**
${conversationContext.substring(0, 800)}...

**CRITICAL VERIFICATION CHECKLIST:**
□ Are all mathematical claims verified and correct?
□ Are logical statements internally consistent?
□ For geometry: Do angle sums check out? Are parallel line properties satisfied?
□ For problems: Is the problem solvable as stated?
□ Have any errors been identified that need fixing?

**Available Phase Options:**
- BRAINSTORM: Generate diverse ideas and approaches
- CRITIQUE: Analyze and provide constructive feedback  
- REVISE: Refine ideas based on feedback
- SYNTHESIZE: Combine best elements into unified solution
- CONSENSUS: Finalize collaborative conclusion

**ULTRA-INTELLIGENT PHASE JUMPING - You can jump to ANY phase!**

**DECISION SCENARIOS:**

1. **INSTANT CONSENSUS** (Jump directly to CONSENSUS from ANY phase):
   - Both models have the SAME verified answer
   - 100% confidence with mathematical proof
   - No errors found, no further discussion needed
   - Example: "We both calculated 42. Jump to CONSENSUS!"

2. **SKIP INTERMEDIATE PHASES** when efficient:
   - BRAINSTORM → SYNTHESIZE (if multiple good ideas, no errors)
   - BRAINSTORM → CONSENSUS (if immediate agreement)
   - CRITIQUE → CONSENSUS (if error fixed perfectly)
   - Any phase → Any phase that makes sense!

3. **STRATEGIC BACKTRACK** when needed:
   - SYNTHESIZE → BRAINSTORM (realized wrong problem)
   - CONSENSUS → CRITIQUE (last-minute error found)
   - Any phase → Earlier phase if needed

4. **CONTINUE CURRENT PHASE** only if:
   - More work genuinely needed in this phase
   - Haven't reached clarity yet
   - Models still diverging

5. **FORCE CRITIQUE** for errors:
   - Mathematical mistakes found
   - Logical contradictions detected
   - Verification failed

**YOUR MISSION:** Choose the MOST EFFICIENT path to reach accurate consensus!
Don't follow rigid sequences - be ADAPTIVE and INTELLIGENT!

**Required Response Format:**
DECISION: [CONTINUE|TRANSITION]
TARGET_PHASE: [if transitioning, specify: BRAINSTORM|CRITIQUE|REVISE|SYNTHESIZE|CONSENSUS]  
REASONING: [Brief explanation INCLUDING any verification issues found]

Make your decision:`;
  }

  /**
   * Generate phase decision using LLM
   */
  private async generatePhaseDecision(
    modelId: string,
    context: LlamaContext,
    prompt: string
  ): Promise<{ shouldTransition: boolean; targetPhase?: CollaborationPhase; reasoning: string }> {
    if (!this.modelService) {
      throw new Error('ModelService is required for phase decision generation');
    }

    const modelConfig = this.modelService.getModelConfig(modelId);
    if (!modelConfig) {
      throw new Error(`Model config not found for ${modelId}`);
    }

    // Format prompt according to model requirements
    const systemPrompt = "You are a conversation flow expert analyzing collaboration quality to make intelligent phase transitions. Be concise and structured in your response.";
    const formatted = PromptFormatter.formatPrompt(modelConfig, systemPrompt, prompt);

    // Get a sequence for this generation
    const sequence = context.getSequence();
    
    try {
      const session = new LlamaChatSession({
        contextSequence: sequence,
        systemPrompt: ''
      });

      const generationOptions: Parameters<typeof session.prompt>[1] = {
        temperature: 0.3, // Low temperature for consistent structured decisions
        topP: 0.8,
        maxTokens: 150 // Keep response short and focused
      };
      
      // Generate decision response
      const response = await session.prompt(formatted.prompt, generationOptions);
      const extractedResponse = PromptFormatter.extractResponse(modelConfig, response);
      
      this.logger.info(`🔍 PHASE DECISION RAW: "${extractedResponse}"`);
      
      const decision = this.parsePhaseDecision(extractedResponse);
      this.logger.info(`🔍 PHASE DECISION PARSED: shouldTransition=${decision.shouldTransition}, targetPhase=${decision.targetPhase}, reasoning="${decision.reasoning}"`);
      
      return decision;
      
    } finally {
      sequence.dispose();
    }
  }

  /**
   * Parse LLM decision response
   */
  private parsePhaseDecision(response: string): { shouldTransition: boolean; targetPhase?: CollaborationPhase; reasoning: string } {
    const lines = response.split('\n').map(line => line.trim());
    let shouldTransition = false;
    let targetPhase: CollaborationPhase | undefined;
    let reasoning = 'Continue current phase';

    this.logger.info(`🔍 PARSING: ${lines.length} lines to parse`);

    for (const line of lines) {
      this.logger.info(`🔍 PARSING LINE: "${line}"`);
      
      if (line.toUpperCase().includes('DECISION:')) {
        const decisionPart = line.split(':')[1]?.trim().toUpperCase();
        shouldTransition = decisionPart?.includes('TRANSITION') || false;
        this.logger.info(`🔍 PARSING DECISION: "${decisionPart}" -> shouldTransition=${shouldTransition}`);
      } else if (line.toUpperCase().includes('TARGET_PHASE:')) {
        const phase = line.split(':')[1]?.trim().toUpperCase();
        this.logger.info(`🔍 PARSING TARGET_PHASE: "${phase}"`);
        
        // Map common phase names to our enum values
        const phaseMapping: Record<string, CollaborationPhase> = {
          'BRAINSTORM': CollaborationPhase.BRAINSTORM,
          'CRITIQUE': CollaborationPhase.CRITIQUE,
          'REVISE': CollaborationPhase.REVISE,
          'SYNTHESIZE': CollaborationPhase.SYNTHESIZE,
          'CONSENSUS': CollaborationPhase.CONSENSUS
        };
        
        if (phase && phaseMapping[phase]) {
          targetPhase = phaseMapping[phase];
          this.logger.info(`🔍 PARSING: Mapped "${phase}" to ${targetPhase}`);
        } else {
          this.logger.info(`🔍 PARSING: Phase "${phase}" not found in mapping, available: ${Object.keys(phaseMapping).join(', ')}`);
        }
      } else if (line.toUpperCase().includes('REASONING:')) {
        reasoning = line.split(':')[1]?.trim() || reasoning;
        this.logger.info(`🔍 PARSING REASONING: "${reasoning}"`);
      }
    }

    // If no explicit decision found, try to parse from natural language
    if (!lines.some(line => line.toUpperCase().includes('DECISION:'))) {
      const responseUpper = response.toUpperCase();
      if (responseUpper.includes('TRANSITION') || responseUpper.includes('MOVE TO') || responseUpper.includes('PROCEED TO')) {
        shouldTransition = true;
        this.logger.debug(`🔍 PARSING: Found implicit transition signal`);
      }
    }

    return {
      shouldTransition,
      targetPhase, // Always return targetPhase, even for CONTINUE decisions
      reasoning
    };
  }
}