import { useUi } from './useStore.ts';

const MODE_LABEL = { walk: 'Walking', fly: 'Flying', takeoff: 'Taking off', landing: 'Landing' } as const;

declare global {
  interface Window {
    __otherworldHudRenders?: number;
  }
}

export function Hud() {
  if (__TEST_HOOKS__) window.__otherworldHudRenders = (window.__otherworldHudRenders ?? 0) + 1;
  const regionName = useUi((s) => s.regionName);
  const regionTitle = useUi((s) => s.regionTitle);
  const label = useUi((s) => s.collectibleLabel);
  const collected = useUi((s) => s.collected);
  const total = useUi((s) => s.total);
  const spirits = useUi((s) => s.spirits);
  const mode = useUi((s) => s.mode);
  const prompt = useUi((s) => s.prompt);
  const heading = useUi((s) => s.headingDeg);
  const compass = useUi((s) => s.compass);
  const portalActive = useUi((s) => s.portalActive);
  return (
    <div className="hud" aria-live="polite">
      <div className="hud-region">
        <div className="hud-region-name">{regionName}</div>
        <div className="hud-region-title">{regionTitle}</div>
      </div>
      <div className="hud-compass" aria-label={`Heading ${heading} degrees`}>
        {compass}
      </div>
      <div className="hud-progress">
        <div className="hud-progress-label">{label}</div>
        <div className="hud-progress-count" data-testid="progress">
          {collected} / {total}
        </div>
        <div className="hud-dots">
          {spirits.map((s) => (
            <span
              key={s.id}
              className={`dot ${s.collected ? 'on' : ''}`}
              style={s.collected ? { background: s.color, boxShadow: `0 0 8px ${s.color}` } : undefined}
              title={s.collected ? s.name : 'Not yet found'}
            />
          ))}
        </div>
        {portalActive && <div className="hud-portal">Petal Gate awake</div>}
      </div>
      <div className="hud-mode" data-testid="mode">
        {MODE_LABEL[mode]} <span className="hint">· F to {mode === 'walk' ? 'take off' : 'land'}</span>
      </div>
      {prompt && (
        <div className="hud-prompt" data-testid="prompt">
          {prompt}
        </div>
      )}
    </div>
  );
}
