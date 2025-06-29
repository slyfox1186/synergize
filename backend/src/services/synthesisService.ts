import { EmbeddingService } from './embeddingService.js';
import { createLogger } from '../utils/logger.js';
import { CollaborationPhase } from '../models/types.js';
import { 
  AgreementAnalysis, 
  ConsensusLevel
} from '../models/curatedConversationTypes.js';
import { StructuredSolution } from '../models/conversationTypes.js';

interface TextSegment {
  content: string;
  startIndex: number;
  endIndex: number;
  vector?: number[];
}

/**
 * State-of-the-art synthesis service that analyzes agreement between two LLM outputs
 * and generates intelligent synthesis without complex AST parsing overhead
 */
export class SynthesisService {
  private embeddingService: EmbeddingService;
  private readonly logger = createLogger('SynthesisService');

  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  /**
   * Analyzes two model outputs and prepares data for LLM-driven synthesis
   */
  async analyzeForSynthesis(
    sessionId: string,
    phase: CollaborationPhase,
    modelA: string,
    outputA: string,
    modelB: string,
    outputB: string
  ): Promise<AgreementAnalysis> {
    try {
      await this.embeddingService.initialize();
      
      // Step 1: Intelligent chunking (simple but effective)
      const segmentsA = this.segmentText(outputA);
      const segmentsB = this.segmentText(outputB);
      
      // Step 2: Embed segments for semantic comparison
      const vectorsA = await this.embedSegments(segmentsA);
      const vectorsB = await this.embedSegments(segmentsB);
      
      // Step 3: Compute overall similarity and analyze agreement patterns
      const overallSimilarity = await this.computeOverallSimilarity(outputA, outputB);
      const analysis = await this.analyzeAgreement(
        sessionId, phase, modelA, modelB, 
        segmentsA, vectorsA, segmentsB, vectorsB, 
        overallSimilarity
      );
      
      this.logger.info(`Analysis complete: ${analysis.consensusLevel} (${(overallSimilarity * 100).toFixed(0)}% similarity)`);
      return analysis;
      
    } catch (error) {
      this.logger.error('Failed to analyze outputs:', error);
      
      // Fallback analysis
      return {
        sessionId,
        phase,
        modelA,
        modelB,
        overallSimilarity: 0.5,
        consensusLevel: ConsensusLevel.MIXED_VIEWS,
        keyPoints: {
          agreements: ['Analysis unavailable - using fallback'],
          conflicts: [],
          complementaryIdeas: [],
          novelInsights: []
        },
        confidenceScore: 0.1
      };
    }
  }

  /**
   * Generate meta-prompt for LLM to create synthesis based on analysis
   */
  createSynthesisPrompt(
    analysis: AgreementAnalysis,
    outputA: string,
    outputB: string,
    phase: CollaborationPhase,
    originalQuery: string
  ): string {
    const { consensusLevel, overallSimilarity, modelA, modelB } = analysis;
    
    // Create compact analysis summary to save tokens
    const analysisReport = this.createCompactAnalysisReport(analysis);
    
    let prompt = `You are a synthesis expert facilitating collaboration between two AI models. Your task is to create a unified, coherent response that combines the best insights from both models.

**Original Query:** ${originalQuery}

**Collaboration Phase:** ${phase}

**Analysis Summary:**
${analysisReport}

**${modelA} Response:**
---
${outputA}
---

**${modelB} Response:**
---
${outputB}
---

**Your Synthesis Task:**
`;

    // Customize instructions based on consensus level
    switch (consensusLevel) {
      case ConsensusLevel.HIGH_CONSENSUS:
        prompt += `The models show strong agreement (${(overallSimilarity * 100).toFixed(0)}% similarity). Create a unified response that:
1. Merges the core agreed-upon points into a coherent narrative
2. Incorporates the best details and examples from both responses
3. Eliminates redundancy while preserving key insights
4. Presents a confident, well-supported conclusion`;
        break;
        
      case ConsensusLevel.MIXED_VIEWS:
        prompt += `The models have mixed agreement (${(overallSimilarity * 100).toFixed(0)}% similarity). Create a balanced synthesis that:
1. Clearly presents the points of agreement as the foundation
2. Addresses differing perspectives with "Both approaches have merit..." framing
3. Integrates complementary ideas to create a more comprehensive solution
4. Provides a nuanced conclusion that respects both viewpoints`;
        break;
        
      case ConsensusLevel.CREATIVE_TENSION:
        prompt += `The models show creative tension (${(overallSimilarity * 100).toFixed(0)}% similarity). Create an innovative synthesis that:
1. Acknowledges the productive disagreement as a strength
2. Explores how different approaches could work together
3. Identifies novel solutions that emerge from combining perspectives
4. Presents a creative "third way" that leverages both viewpoints`;
        break;
        
      case ConsensusLevel.NO_CONSENSUS:
        prompt += `The models show significant disagreement (${(overallSimilarity * 100).toFixed(0)}% similarity). Create a diplomatic synthesis that:
1. Fairly represents both positions without bias
2. Identifies any small areas of common ground
3. Clearly explains the trade-offs of each approach
4. Suggests criteria for choosing between approaches or need for additional information`;
        break;
    }

    prompt += `

**Formatting Guidelines:**
- Use markdown formatting for clarity and readability
- Structure your response with appropriate headings and sections
- Use bullet points, numbered lists, or other formatting to organize information
- Emphasize key terms and concepts with **bold** text where appropriate
- You are encouraged to use markdown tables to display structured data
- Consider using sections like "Key Points," "Important Considerations," "Implications," etc. as makes sense for the content

**Content Guidelines:**
- Write as a single, coherent response, not commentary about the models
- Do not mention "Model A", "Model B", or the collaboration process
- Focus on substance and provide actionable insights
- Include specific details, examples, and concrete information where relevant
- Present information in an authoritative, well-structured manner

**CRITICAL VERIFICATION SECTION:**
- You MUST include a "### Verification" section at the end
- Show all mathematical/logical checks performed
- For geometry: Verify angle sums, parallel line properties, triangle inequality
- For logic: Check consistency, validate constraints
- If ANY errors are found, clearly state: "⚠️ ERROR DETECTED: [description]"
- Only present solutions that pass ALL verification checks

Create a comprehensive, well-formatted synthesis that effectively addresses the original query WITH MANDATORY VERIFICATION:`;

    return prompt;
  }

  /**
   * Create a compact analysis report for the meta-prompt
   */
  private createCompactAnalysisReport(analysis: AgreementAnalysis): string {
    const { consensusLevel, overallSimilarity, keyPoints } = analysis;
    
    let report = `• Agreement Level: ${consensusLevel.replace('_', ' ')} (${(overallSimilarity * 100).toFixed(0)}% similarity)\n`;
    
    if (keyPoints.agreements.length > 0) {
      report += `• Strong Agreements: ${keyPoints.agreements.length} points\n`;
    }
    
    if (keyPoints.complementaryIdeas.length > 0) {
      report += `• Complementary Ideas: ${keyPoints.complementaryIdeas.length} different but valuable approaches\n`;
    }
    
    if (keyPoints.conflicts.length > 0) {
      report += `• Conflicting Views: ${keyPoints.conflicts.length} areas of disagreement\n`;
    }
    
    if (keyPoints.novelInsights.length > 0) {
      report += `• Unique Insights: ${keyPoints.novelInsights.length} novel contributions\n`;
    }
    
    return report;
  }

  /**
   * Segment text into meaningful chunks without complex parsing
   * Uses paragraph boundaries, sentence boundaries, and length limits
   */
  private segmentText(text: string): TextSegment[] {
    const segments: TextSegment[] = [];
    
    // First, split by double newlines (paragraphs)
    const paragraphs = text.split(/\n\s*\n/);
    let currentIndex = 0;
    
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (trimmed.length === 0) {
        currentIndex += paragraph.length + 2; // +2 for \n\n
        continue;
      }
      
      // If paragraph is short enough, keep as one segment
      if (trimmed.length <= 500) {
        segments.push({
          content: trimmed,
          startIndex: currentIndex,
          endIndex: currentIndex + trimmed.length
        });
      } else {
        // Split long paragraphs by sentences
        const sentences = trimmed.split(/[.!?]+\s/);
        let paragraphOffset = 0;
        
        for (const sentence of sentences) {
          const sentenceTrimmed = sentence.trim();
          if (sentenceTrimmed.length > 0) {
            segments.push({
              content: sentenceTrimmed,
              startIndex: currentIndex + paragraphOffset,
              endIndex: currentIndex + paragraphOffset + sentenceTrimmed.length
            });
            paragraphOffset += sentenceTrimmed.length + 2; // Approximate for punctuation/space
          }
        }
      }
      
      currentIndex += paragraph.length + 2;
    }
    
    return segments;
  }

  /**
   * Embed text segments for semantic comparison
   */
  private async embedSegments(segments: TextSegment[]): Promise<TextSegment[]> {
    const texts = segments.map(s => s.content);
    const vectors = await this.embeddingService.embedBatch(texts);
    
    return segments.map((segment, index) => ({
      ...segment,
      vector: vectors[index]
    }));
  }

  /**
   * Compute overall semantic similarity between two outputs
   */
  private async computeOverallSimilarity(outputA: string, outputB: string): Promise<number> {
    const [vectorA, vectorB] = await Promise.all([
      this.embeddingService.embed(outputA),
      this.embeddingService.embed(outputB)
    ]);
    
    return this.cosineSimilarity(vectorA, vectorB);
  }

  /**
   * Analyze agreement patterns between segmented outputs
   */
  private async analyzeAgreement(
    sessionId: string,
    phase: CollaborationPhase,
    modelA: string,
    modelB: string,
    segmentsA: TextSegment[],
    vectorsA: TextSegment[],
    segmentsB: TextSegment[],
    vectorsB: TextSegment[],
    overallSimilarity: number
  ): Promise<AgreementAnalysis> {
    
    const agreements: string[] = [];
    const conflicts: string[] = [];
    const complementaryIdeas: string[] = [];
    const novelInsights: string[] = [];
    
    // Find best matches between segments
    const processedA = new Set<number>();
    const processedB = new Set<number>();
    
    for (let i = 0; i < vectorsA.length; i++) {
      if (processedA.has(i) || !vectorsA[i].vector) continue;
      
      let bestMatch = -1;
      let bestSimilarity = -1;
      
      for (let j = 0; j < vectorsB.length; j++) {
        if (processedB.has(j) || !vectorsB[j].vector) continue;
        
        const vectorA = vectorsA[i].vector;
        const vectorB = vectorsB[j].vector;
        if (!vectorA || !vectorB) continue;
        
        const similarity = this.cosineSimilarity(vectorA, vectorB);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatch = j;
        }
      }
      
      if (bestMatch !== -1) {
        processedA.add(i);
        processedB.add(bestMatch);
        
        if (bestSimilarity > 0.85) {
          agreements.push(`Both models agree: "${this.truncateText(segmentsA[i].content, 100)}"`);
        } else if (bestSimilarity > 0.6) {
          agreements.push(`Similar approaches: "${this.truncateText(segmentsA[i].content, 80)}" vs "${this.truncateText(segmentsB[bestMatch].content, 80)}"`);
        } else if (bestSimilarity > 0.4) {
          complementaryIdeas.push(`Different but related: ${modelA} suggests "${this.truncateText(segmentsA[i].content, 80)}" while ${modelB} proposes "${this.truncateText(segmentsB[bestMatch].content, 80)}"`);
        } else {
          conflicts.push(`Conflicting views: ${modelA}: "${this.truncateText(segmentsA[i].content, 80)}" vs ${modelB}: "${this.truncateText(segmentsB[bestMatch].content, 80)}"`);
        }
      }
    }
    
    // Collect novel insights (unmatched segments)
    for (let i = 0; i < segmentsA.length; i++) {
      if (!processedA.has(i)) {
        novelInsights.push(`${modelA} unique insight: "${this.truncateText(segmentsA[i].content, 100)}"`);
      }
    }
    
    for (let j = 0; j < segmentsB.length; j++) {
      if (!processedB.has(j)) {
        novelInsights.push(`${modelB} unique insight: "${this.truncateText(segmentsB[j].content, 100)}"`);
      }
    }
    
    // Determine consensus level
    const consensusLevel = this.determineConsensusLevel(
      overallSimilarity, 
      agreements.length, 
      conflicts.length, 
      complementaryIdeas.length
    );
    
    // Calculate confidence based on segment count and similarity distribution
    const totalSegments = segmentsA.length + segmentsB.length;
    const processedSegments = processedA.size + processedB.size;
    const confidenceScore = Math.min(0.95, (processedSegments / totalSegments) * 0.8 + overallSimilarity * 0.2);
    
    return {
      sessionId,
      phase,
      modelA,
      modelB,
      overallSimilarity,
      consensusLevel,
      keyPoints: {
        agreements,
        conflicts,
        complementaryIdeas,
        novelInsights
      },
      confidenceScore
    };
  }


  /**
   * Determine consensus level based on similarity and agreement patterns
   */
  private determineConsensusLevel(
    overallSimilarity: number,
    agreementCount: number,
    conflictCount: number,
    _complementaryCount: number
  ): ConsensusLevel {
    
    if (overallSimilarity > 0.8 && agreementCount > conflictCount * 2) {
      return ConsensusLevel.HIGH_CONSENSUS;
    } else if (overallSimilarity > 0.6 && agreementCount >= conflictCount) {
      return ConsensusLevel.MIXED_VIEWS;
    } else if (overallSimilarity > 0.4) {
      return ConsensusLevel.CREATIVE_TENSION;
    } else {
      return ConsensusLevel.NO_CONSENSUS;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (normA * normB);
  }

  /**
   * Create synthesis prompt using vector-retrieved insights (memory efficient)
   */
  async createVectorBasedSynthesisPrompt(
    analysis: AgreementAnalysis,
    relevantInsights: string[],
    phase: CollaborationPhase,
    originalQuery: string
  ): Promise<string> {
    const { consensusLevel, overallSimilarity } = analysis;
    
    const prompt = `You are creating the FINAL SYNTHESIS for a collaborative AI analysis. Your role is to present the conclusive answer with confidence.

**CRITICAL INSTRUCTIONS:**
1. The insights are organized into two sections:
   - "FINAL SOLUTIONS" contains the actual final answers from both models - THIS IS THE MOST IMPORTANT
   - "DISCUSSION CONTEXT" contains earlier discussion for background only
2. Look for the NUMERICAL ANSWER in the FINAL SOLUTIONS section
3. State the answer CLEARLY and CONFIDENTLY at the beginning
4. If both models agree on an answer, present it as CONCLUSIVE

**Original Query:** ${originalQuery}

**Collaboration Analysis:**
- Consensus Level: ${consensusLevel}
- Agreement Score: ${(overallSimilarity * 100).toFixed(0)}%
- Phase: ${phase}

**Insights from Collaboration:**
${relevantInsights.join('\n')}

**YOUR SYNTHESIS TASK:**

1. **FIRST PARAGRAPH**: State the final answer clearly and directly
   - If a numerical answer exists (like "263" or "11"), state it prominently
   - Reflect the confidence level shown in the FINAL SOLUTIONS
   - If both models state "conclusive" or "no errors", reflect that certainty

2. **EXPLANATION**: Briefly explain how the models arrived at this answer
   - Use the DISCUSSION CONTEXT to show the reasoning journey
   - Keep this section concise

3. **CONSENSUS STATEMENT**: Explicitly state whether the models reached consensus
   - If they both found the same answer, emphasize this agreement
   - Use strong, confident language when consensus is achieved

**IMPORTANT**: 
- Do NOT express doubt if the models are confident
- Do NOT say "might be" or "possibly" if both models are certain
- DO highlight the specific numerical answer if one exists
- DO use confident language like "The solution is..." rather than "The solution appears to be..."

Generate the synthesis:`;

    return prompt;
  }

  /**
   * Phase 2: Create enhanced synthesis prompt with structured solutions
   */
  async createStructuredSynthesisPrompt(
    analysis: AgreementAnalysis,
    structuredSolutions: Map<string, StructuredSolution>,
    relevantInsights: string[],
    phase: CollaborationPhase,
    originalQuery: string
  ): Promise<string> {
    const { consensusLevel, overallSimilarity } = analysis;
    
    // Format structured solutions for the prompt
    const solutionSummary = this.formatStructuredSolutions(structuredSolutions);
    
    const prompt = `You are creating the FINAL SYNTHESIS for a collaborative AI analysis session. Your synthesis should be comprehensive, well-formatted, and clearly present the conclusions reached through collaboration.

**STRUCTURED SOLUTIONS (Most Important):**
${solutionSummary}

**Original Query:** ${originalQuery}

**Collaboration Analysis:**
- Consensus Level: ${consensusLevel}
- Agreement Score: ${(overallSimilarity * 100).toFixed(0)}%
- Phase: ${phase}

**Additional Context:**
${relevantInsights.join('\n')}

**YOUR SYNTHESIS INSTRUCTIONS:**

Create a well-formatted synthesis with the following structure:

## CONSENSUS - SYNTHESIS

### Finding the Measure of ∠DPE in △ABC

**1. Problem Statement and Setup:**
- Restate the problem clearly
- List all given information
- State what needs to be found

**2. Key Points & Insights:**
- List the important insights discovered during collaboration
- Include any critical observations or patterns
- Mention the specific approach used (if relevant)

**3. Solution Process:**
- Provide a clear, step-by-step solution
- Include intermediate calculations
- Show verification steps

**4. Final Answer and Conclusion:**
The answer is **[INSERT ANSWER HERE]**, representing [what it represents].

Both models reached this conclusion with ${
  structuredSolutions.size > 0 && 
  Array.from(structuredSolutions.values()).every(s => s.confidence === 'high') 
    ? 'high confidence' 
    : 'consensus'
} through ${
  structuredSolutions.size > 0 &&
  Array.from(structuredSolutions.values()).every(s => s.status === 'conclusive')
    ? 'rigorous verification'
    : 'collaborative analysis'
}. ${
  analysis.keyPoints.agreements.length > 0 
    ? `The models independently verified the solution through ${analysis.keyPoints.agreements.length} key agreement points.`
    : 'The collaborative process ensured accuracy.'
}

**FORMATTING REQUIREMENTS:**
- Use proper markdown formatting with headers (##, ###)
- Use **bold** for emphasis on key terms and the final answer
- Include bullet points for lists
- Make the synthesis visually appealing and easy to read
- Aim for 300-500 words to provide comprehensive coverage
- Include mathematical notation where appropriate (e.g., ∠ABC, △XYZ)

Generate the synthesis:`;

    return prompt;
  }

  /**
   * Format structured solutions for the synthesis prompt
   */
  private formatStructuredSolutions(solutions: Map<string, StructuredSolution>): string {
    const formatted: string[] = [];
    
    for (const [modelId, solution] of solutions) {
      formatted.push(`**${modelId}:**
- Answer: ${solution.value}
- Confidence: ${solution.confidence}
- Status: ${solution.status}
- Reasoning: ${solution.reasoning || 'N/A'}
${solution.metadata?.sumOfDigits ? `- Sum of Digits: ${solution.metadata.sumOfDigits}` : ''}`);
    }
    
    return formatted.join('\n\n');
  }

  /**
   * Truncate text for display
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
}