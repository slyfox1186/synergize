interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props): JSX.Element {
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-synergy-dark/50 border border-synergy-primary/20 backdrop-blur-sm">
      <div className={`w-3 h-3 rounded-full ${connected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'} animate-pulse`} />
      <span className={`text-lg font-semibold tracking-wide ${connected ? 'text-emerald-400' : 'text-red-400'}`}>
        {connected ? 'CONNECTED' : 'DISCONNECTED'}
      </span>
    </div>
  );
}