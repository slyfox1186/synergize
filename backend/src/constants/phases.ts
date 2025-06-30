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
  [CollaborationPhase.BRAINSTORM]: 'Explore the problem with confidence. Show clear reasoning. If you and your partner immediately agree on a verified answer, be CONFIDENT and suggest jumping to CONSENSUS.',
  [CollaborationPhase.CRITIQUE]: 'Check for genuine mathematical errors only. Do NOT create doubt where none exists. If the answer is verified correct, acknowledge it. Only flag ACTUAL mistakes, not stylistic preferences.',
  [CollaborationPhase.REVISE]: 'Fix only REAL errors that were identified. If no actual errors exist, state that clearly and suggest moving forward.',
  [CollaborationPhase.SYNTHESIZE]: 'Integrate the best verified insights. If both models already agree, simply confirm the shared answer.',
  [CollaborationPhase.CONSENSUS]: 'Confirm the final answer. If you both had the same answer from the start, celebrate the agreement!',
  [CollaborationPhase.COMPLETE]: 'Complete.'
};

/**
 * Verification reminder text for system prompts
 */
export const VERIFICATION_REMINDER = ` Be CONFIDENT when your answer is mathematically verified. Trust your calculations. Only raise concerns about ACTUAL errors, not style preferences. If both models agree on a verified answer, that's SUCCESS - don't create artificial doubt!`;


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