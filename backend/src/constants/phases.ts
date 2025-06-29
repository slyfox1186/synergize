/**
 * Phase-related constants for the collaboration system
 */
import { CollaborationPhase } from '../models/types.js';

/**
 * Phase instructions for model behavior during collaboration
 * These instructions emphasize verification and correctness
 */
export const PHASE_INSTRUCTIONS: Record<CollaborationPhase, string> = {
  [CollaborationPhase.IDLE]: 'Ready.',
  [CollaborationPhase.BRAINSTORM]: 'Explore thoroughly. Show all steps. Try simplest interpretation first.',
  [CollaborationPhase.CRITIQUE]: 'Verify all claims/logic. Flag errors. COMPLEXITY CREEP = wrong assumptions. Many decimals → question premise. Keep solution until simpler verified.',
  [CollaborationPhase.REVISE]: 'Fix with proof. Accuracy > speed. If complex: test simpler first, verify before replacing.',
  [CollaborationPhase.SYNTHESIZE]: 'Integrate verified insights. Include validation.',
  [CollaborationPhase.CONSENSUS]: 'Re-solve independently. Converge on truth.',
  [CollaborationPhase.COMPLETE]: 'Done.'
};

/**
 * Verification reminder text for system prompts
 */
export const VERIFICATION_REMINDER = ` Wrong = fail. Complexity creep → wrong assumptions. Complex decimals → rethink problem.`;


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