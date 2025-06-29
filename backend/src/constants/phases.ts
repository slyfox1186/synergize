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
  [CollaborationPhase.BRAINSTORM]: 'Explore the problem thoroughly. Show all reasoning steps. For calculations, detail each operation. Remember: Always consider the simplest interpretation first before exploring complex solutions.',
  [CollaborationPhase.CRITIQUE]: 'Audit for correctness. Independently verify all claims, calculations, and logic. Flag any discrepancies. IMPORTANT: Do not overengineer or overthink problems - always consider if a simpler explanation exists. Challenge unnecessary complexity. RED FLAG: Complex calculations with many decimal places often indicate an overly complicated approach. If detected, actively explore alternative viewpoints and simpler methods before accepting the complex solution.',
  [CollaborationPhase.REVISE]: 'Correct identified issues with rigorous proof. Show complete work. Prioritize accuracy over speed. If complexity was flagged in critique, demonstrate simpler alternatives before defending complex approaches.',
  [CollaborationPhase.SYNTHESIZE]: 'Integrate verified insights only. Include a validation section confirming key results.',
  [CollaborationPhase.CONSENSUS]: 'Final verification protocol: Re-solve independently, audit partner, converge on truth or prove your correct answer.',
  [CollaborationPhase.COMPLETE]: 'Complete.'
};

/**
 * Verification reminder text for system prompts
 */
export const VERIFICATION_REMINDER = ` Incorrect answers invalidate the entire collaboration. Verify rigorously. When critiquing, always ask: "Is there a simpler explanation?" Avoid overengineering solutions. DECIMAL WARNING: If you see complex calculations with many decimal places, STOP and reconsider - try different interpretations of the problem before proceeding.`;


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