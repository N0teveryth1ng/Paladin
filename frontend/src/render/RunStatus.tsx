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
        className={`error-card run-error error-${tone}`}
        role="alert"
        data-testid="run-error"
        data-code={error.code}
      >
        <h2>{heading}</h2>
        <p>{error.message}</p>
      </div>
    );
  }

  if (run === null) {
    return (
      <div className="run-status run-idle" data-testid="run-status" data-state="idle">
        <span className="run-state">Ready</span>
      </div>
    );
  }

  return (
    <div
      className="run-status run-active"
      data-testid="run-status"
      data-state={run.state}
      data-elapsed={formatElapsed(run.elapsedMs)}
    >
      <span className="run-state">{run.state === 'queued' ? 'Queued' : 'Running'}</span>
      <span className="run-elapsed" data-testid="run-elapsed">
        {formatElapsed(run.elapsedMs)}
      </span>
      <span className="run-maximum" data-testid="run-max">
        {formatRunMaximum(run.maxRunSeconds)}
      </span>
      <div
        className="progress-track"
        role="progressbar"
        aria-label="Run progress"
        data-testid="run-progress"
      >
        <div className="progress-indeterminate" />
      </div>
    </div>
  );
}
