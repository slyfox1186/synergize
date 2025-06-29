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
  [CollaborationPhase.BRAINSTORM]: 'Explore the problem thoroughly. Show all reasoning steps. For calculations, detail each operation.',
  [CollaborationPhase.CRITIQUE]: 'Audit for correctness. Independently verify all claims, calculations, and logic. Flag any discrepancies.',
  [CollaborationPhase.REVISE]: 'Correct identified issues with rigorous proof. Show complete work. Prioritize accuracy over speed.',
  [CollaborationPhase.SYNTHESIZE]: 'Integrate verified insights only. Include a validation section confirming key results.',
  [CollaborationPhase.CONSENSUS]: 'Final verification protocol: Re-solve independently, audit partner, converge on truth or prove your correct answer.',
  [CollaborationPhase.COMPLETE]: 'Complete.'
};

/**
 * Verification reminder text for system prompts
 */
export const VERIFICATION_REMINDER = ` Incorrect answers invalidate the entire collaboration. Verify rigorously.`;


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