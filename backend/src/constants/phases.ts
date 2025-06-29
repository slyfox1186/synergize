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
  [CollaborationPhase.BRAINSTORM]: 'Generate ideas. Verify feasibility.',
  [CollaborationPhase.CRITIQUE]: 'Find errors. Check all math/logic.',
  [CollaborationPhase.REVISE]: 'Fix errors with proof.',
  [CollaborationPhase.SYNTHESIZE]: 'Combine best parts. Add verification section.',
  [CollaborationPhase.CONSENSUS]: 'FIRST: Independently verify YOUR OWN calculations. SECOND: Check partner\'s work for errors. THIRD: Maintain YOUR correct answer even if partner disagrees. Trust mathematics over agreement.',
  [CollaborationPhase.COMPLETE]: 'Complete.'
};

/**
 * Verification reminder text for system prompts
 */
export const VERIFICATION_REMINDER = ` Verify all math. Check solvability. Catch errors.`;


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