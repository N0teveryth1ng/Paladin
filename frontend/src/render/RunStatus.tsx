import {
  formatElapsed,
  formatRunMaximum,
  type PendingRun,
  type RunErrorView,
} from '../app/live';

/** Progress is indeterminate: elapsed time and the server maximum, never a fake percentage. */
export function RunStatus({
  run,
  error,
}: {
  run: PendingRun | null;
  error: RunErrorView | null;
}) {
  if (error !== null) {
    const heading =
      error.code === 'rate_limited'
        ? 'Daily limit reached'
        : error.code === 'run_timeout' || error.code === 'provider_timeout'
          ? 'Run timed out'
          : 'Run failed';
    const tone =
      error.code === 'rate_limited'
        ? 'rate-limited'
        : error.code === 'run_timeout' || error.code === 'provider_timeout'
          ? 'timeout'
          : 'other';
    return (
      <div
        className={`error-card run-error error-${tone} rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs text-red-100 shadow-xl backdrop-blur-xl`}
        role="alert"
        data-testid="run-error"
        data-code={error.code}
      >
        <h2 className="m-0 text-[13px] font-semibold">{heading}</h2>
        <p className="m-0 mt-1 text-red-200/80">{error.message}</p>
      </div>
    );
  }

  if (run === null) {
    return (
      <div className="run-status run-idle hidden" data-testid="run-status" data-state="idle">
        <span className="run-state text-xs text-zinc-400">Ready</span>
      </div>
    );
  }

  return (
    <div
      className="run-status run-active flex items-center gap-2.5 rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2 text-[11px] text-indigo-100 shadow-xl backdrop-blur-xl"
      data-testid="run-status"
      data-state={run.state}
      data-elapsed={formatElapsed(run.elapsedMs)}
    >
      <span className="run-state font-medium text-indigo-100">{run.state === 'queued' ? 'Queued' : 'Running'}</span>
      <span className="run-elapsed font-mono tabular-nums text-indigo-200/80" data-testid="run-elapsed">
        {formatElapsed(run.elapsedMs)}
      </span>
      <span className="run-maximum font-mono tabular-nums text-indigo-300/60" data-testid="run-max">
        {formatRunMaximum(run.maxRunSeconds)}
      </span>
      <div
        className="progress-track h-1 w-16 overflow-hidden rounded-full bg-indigo-200/15"
        role="progressbar"
        aria-label="Run progress"
        data-testid="run-progress"
      >
        <div className="progress-indeterminate h-full w-2/5 animate-pulse rounded-full bg-gradient-to-r from-indigo-400 to-fuchsia-400" />
      </div>
    </div>
  );
}
