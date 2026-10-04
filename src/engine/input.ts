// Keyboard + mouse input with pointer lock (plan §12.1). Descend is C, not Ctrl (decision D2):
// Ctrl+W / Ctrl+D are browser shortcuts that a page generally cannot block.

const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyE', 'KeyF', 'ShiftLeft', 'ShiftRight', 'F3', 'Backquote', 'KeyM']);

export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private dx = 0;
  private dy = 0;
  private dragging = false;
  locked = false;
  /** When true, game keys don't trigger browser defaults (scrolling etc.). */
  active = false;
  private readonly canvas: HTMLCanvasElement;
  private readonly onLockChange: (locked: boolean) => void;
  private readonly listeners: [EventTarget, string, EventListener][] = [];

  constructor(canvas: HTMLCanvasElement, onLockChange: (locked: boolean) => void) {
    this.canvas = canvas;
    this.onLockChange = onLockChange;
    this.on(window, 'keydown', (e) => {
      const k = e as KeyboardEvent;
      if (k.code === 'F3' || k.code === 'Backquote' || (this.active && GAME_KEYS.has(k.code))) k.preventDefault();
      if (!k.repeat) this.pressed.add(k.code);
      this.down.add(k.code);
    });
    this.on(window, 'keyup', (e) => this.down.delete((e as KeyboardEvent).code));
    this.on(window, 'blur', () => this.down.clear());
    this.on(document, 'mousemove', (e) => {
      const m = e as MouseEvent;
      if (this.locked || this.dragging) {
        this.dx += m.movementX;
        this.dy += m.movementY;
      }
    });
    this.on(canvas, 'mousedown', () => {
      this.dragging = !this.locked;
    });
    this.on(window, 'mouseup', () => {
      this.dragging = false;
    });
    this.on(document, 'pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      this.onLockChange(this.locked);
    });
  }

  private on(target: EventTarget, type: string, fn: EventListener): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.dx, dy: this.dy };
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  requestLock(): void {
    try {
      const r = this.canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => {});
    } catch {
      // Pointer lock unavailable (e.g. headless); drag-to-look still works.
    }
  }

  exitLock(): void {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  dispose(): void {
    for (const [t, type, fn] of this.listeners) t.removeEventListener(type, fn);
  }
}
