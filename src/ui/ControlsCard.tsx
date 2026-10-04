const CONTROLS: [string, string][] = [
  ['W A S D', 'Move (fly: thrust, brake, strafe)'],
  ['Mouse', 'Look / steer'],
  ['Space', 'Jump · ascend while flying'],
  ['C', 'Descend while flying'],
  ['Shift', 'Sprint · boost'],
  ['F', 'Take off / land'],
  ['E', 'Collect · use the gate'],
  ['Esc', 'Pause · close menus'],
];

export function ControlsCard() {
  return (
    <dl className="controls">
      {CONTROLS.map(([k, v]) => (
        <div key={k} className="controls-row">
          <dt>
            <kbd>{k}</kbd>
          </dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
