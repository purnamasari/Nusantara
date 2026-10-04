import { ControlsCard } from './ControlsCard.tsx';
import { useCommands, useUi } from './useStore.ts';

export function StartScreen() {
  const hasSave = useUi((s) => s.hasSave);
  const { start } = useCommands();
  return (
    <div className="overlay start" role="dialog" aria-labelledby="title">
      <div className="panel">
        <p className="eyebrow">A fantasy archipelago</p>
        <h1 id="title">Archipelago: Otherworld</h1>
        <p className="subtitle">Bandung — The Blooming Highlands</p>
        <p className="lede">
          Explore a familiar land transformed. Walk the flower fields, glide over the highlands, and find the five Flora
          Spirits to awaken the Petal Gate.
        </p>
        <button className="primary" onClick={start} autoFocus>
          {hasSave ? 'Continue' : 'Play'}
        </button>
        <ControlsCard />
        <p className="credits">
          Terrain in this build is a synthetic stand-in shaped like the Bandung basin; real elevation data is pending a
          data-licence review. Landmarks are fictional.
        </p>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  const stage = useUi((s) => s.loadingStage);
  return (
    <div className="overlay loading" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{stage || 'Loading…'}</p>
    </div>
  );
}

export function ErrorScreen() {
  const error = useUi((s) => s.error);
  const { retry } = useCommands();
  return (
    <div className="overlay error" role="alertdialog" aria-labelledby="error-title">
      <div className="panel">
        <h1 id="error-title">Something went wrong</h1>
        <p className="error-code" data-testid="error-code">
          {error?.code ?? 'UNEXPECTED'}
        </p>
        <p>{error?.message}</p>
        {error && error.details.length > 0 && (
          <ul className="error-details">
            {error.details.slice(0, 8).map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
        <button className="primary" onClick={retry}>
          Retry
        </button>
      </div>
    </div>
  );
}

export function PauseOverlay() {
  const { resume } = useCommands();
  return (
    <div className="overlay pause" onClick={resume} role="dialog" aria-label="Paused">
      <div className="panel compact">
        <h2>Paused</h2>
        <button className="primary" onClick={resume} autoFocus>
          Click to resume
        </button>
        <ControlsCard />
      </div>
    </div>
  );
}

const STATUS_LABEL = { locked: 'Locked', unlocked: 'Unlocked', visited: 'Visited', completed: 'Completed' } as const;

export function TeleportMenu() {
  const options = useUi((s) => s.teleport);
  const { teleport, closeMenu } = useCommands();
  return (
    <div className="overlay menu" role="dialog" aria-labelledby="teleport-title">
      <div className="panel">
        <h2 id="teleport-title">The Petal Gate</h2>
        <p className="lede">Choose a destination. Restore a region to open the way onward.</p>
        <ul className="destinations">
          {options.map((o) => (
            <li key={o.id} className={`destination status-${o.status}`} data-testid={`dest-${o.id}`}>
              <div>
                <strong>{o.name}</strong> <span className="dest-title">— {o.title}</span>
                <div className="dest-note">{o.note}</div>
              </div>
              <span className={`badge badge-${o.status}`} data-testid={`status-${o.id}`}>
                {STATUS_LABEL[o.status]}
              </span>
              <button disabled={!o.available} onClick={() => teleport(o.id)}>
                {o.current ? 'Here' : o.available ? 'Travel' : 'Unavailable'}
              </button>
            </li>
          ))}
        </ul>
        <button className="secondary" onClick={closeMenu}>
          Close (Esc)
        </button>
      </div>
    </div>
  );
}
