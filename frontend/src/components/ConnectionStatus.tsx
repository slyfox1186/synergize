interface Props {
  connected: boolean;
}

export function ConnectionStatus({ connected }: Props): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`} />
      <span className="text-sm text-jarvis-muted">
        {connected ? 'Connected' : 'Disconnected'}
      </span>
    </div>
  );
}