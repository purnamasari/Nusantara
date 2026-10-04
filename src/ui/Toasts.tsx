import { useUi } from './useStore.ts';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`} data-testid="toast">
          {t.text}
        </div>
      ))}
    </div>
  );
}

export function DebugPanel() {
  const d = useUi((s) => s.debug);
  if (!d) return null;
  return (
    <pre className="debug" data-testid="debug">
      {`FPS ${d.fps}  ${d.frameMs} ms
calls ${d.calls}  tris ${d.triangles}
geom ${d.geometries}  tex ${d.textures}
xyz ${d.x}, ${d.y}, ${d.z}
lat ${d.lat}  lon ${d.lon}
heading ${d.headingDeg}°`}
    </pre>
  );
}
