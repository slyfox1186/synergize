/**
 * Phase-related constants for the collaboration system
 */
import { CollaborationPhase } from '../models/types.js';

/**
 * Phase instructions for model behavior during collaboration
 * These instructions emphasize verification and correctness
 */
export const PHASE_INSTRUCTIONS: Record<CollaborationPhase, string> = {
  [CollaborationPhase.IDLE]: 'Ready to begin.',
  [CollaborationPhase.BRAINSTORM]: 'Explore thoroughly. Show reasoning steps. Start simple, add complexity only when necessary.',
  [CollaborationPhase.CRITIQUE]: 'Audit all claims and calculations. Red-flags: complexity creep, excessive decimals—often signal flawed assumptions. Challenge premise but verify alternatives work.',
  [CollaborationPhase.REVISE]: 'Fix issues with proof. Accuracy over speed. Verify simpler approaches work before implementing.',
  [CollaborationPhase.SYNTHESIZE]: 'Integrate verified insights only. Include a validation section confirming key results.',
  [CollaborationPhase.CONSENSUS]: 'Final verification protocol: Re-solve independently, audit partner, converge on truth or prove your correct answer.',
  [CollaborationPhase.COMPLETE]: 'Complete.'
};

/**
 * Verification reminder text for system prompts
 */
export const VERIFICATION_REMINDER = ` Incorrect answers invalidate the entire collaboration. Verify rigorously. Red-flags (complexity, excessive decimals) often indicate incorrect assumptions—think hard, question fundamentals.`;


/**
 * Phase transition messages
 */
export const PHASE_TRANSITIONS = {
  TO_BRAINSTORM: "→ Brainstorm",
  TO_CRITIQUE: "→ Critique",
  TO_REVISE: "→ Revise",
  TO_SYNTHESIZE: "→ Synthesize",
  TO_CONSENSUS: "→ Consensus",
  TO_COMPLETE: "→ Complete"
};