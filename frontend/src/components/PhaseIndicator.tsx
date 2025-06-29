import { useCollaborationStore } from '@/store/collaborationStore';
import { CollaborationPhase } from '@/types';

const phaseColors: Record<CollaborationPhase, string> = {
  [CollaborationPhase.IDLE]: 'text-synergy-muted',
  [CollaborationPhase.BRAINSTORM]: 'text-blue-400',
  [CollaborationPhase.CRITIQUE]: 'text-orange-400',
  [CollaborationPhase.REVISE]: 'text-purple-400',
  [CollaborationPhase.SYNTHESIZE]: 'text-green-400',
  [CollaborationPhase.CONSENSUS]: 'text-synergy-accent',
  [CollaborationPhase.COMPLETE]: 'text-synergy-primary',
};

const phaseBorderColors: Record<CollaborationPhase, string> = {
  [CollaborationPhase.IDLE]: 'border-synergy-muted/30',
  [CollaborationPhase.BRAINSTORM]: 'border-blue-400/50',
  [CollaborationPhase.CRITIQUE]: 'border-orange-400/50',
  [CollaborationPhase.REVISE]: 'border-purple-400/50',
  [CollaborationPhase.SYNTHESIZE]: 'border-green-400/50',
  [CollaborationPhase.CONSENSUS]: 'border-synergy-accent/50',
  [CollaborationPhase.COMPLETE]: 'border-synergy-primary/50',
};

export function PhaseIndicator(): JSX.Element {
  const { currentPhase, isStreaming, statusMessage } = useCollaborationStore();

  const isActive = currentPhase !== CollaborationPhase.IDLE && currentPhase !== CollaborationPhase.COMPLETE;

  return (
    <div className={`
      flex flex-col gap-2 bg-synergy-dark/90 backdrop-blur-sm rounded-lg px-6 py-4 min-w-[250px]
      border-2 ${phaseBorderColors[currentPhase as CollaborationPhase]}
      ${isActive ? 'animate-pulse' : ''}
      transition-all duration-300 hover:bg-synergy-dark
    `}>
      <div className="flex items-center gap-4">
        {isStreaming && (
          <div className="animate-spin rounded-full h-8 w-8 border-b-4 border-synergy-primary" />
        )}
        <div className="flex flex-col">
          <span className="text-synergy-muted text-xs font-tech uppercase tracking-wider mb-1">Current Phase</span>
          <span className={`font-tech text-3xl font-bold uppercase tracking-wider ${phaseColors[currentPhase as CollaborationPhase]} text-glow`}>
            {currentPhase}
          </span>
        </div>
      </div>
      {statusMessage && (
        <div className="text-sm text-synergy-text/80 font-tech mt-2 whitespace-pre-wrap border-t border-synergy-primary/20 pt-2">
          {statusMessage}
        </div>
      )}
    </div>
  );
}