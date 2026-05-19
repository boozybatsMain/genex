import type { InputApi } from "@poc/shared";

/**
 * Per-frame, browser-global input state. The runtime calls `install(target)`
 * once when entering Play Mode, calls `beginFrame` at the top of each tick
 * (so press/release edges and motion deltas refer to *this* frame), then
 * `endFrame` after scripts have run, and finally `uninstall` when leaving
 * Play Mode.
 *
 * Listeners are attached to `window` in the capture phase so nothing inside
 * the React tree (notably R3F's pointer-event system on the Canvas) can
 * swallow them before we see them. Pointer Lock can ONLY be requested from
 * a user gesture, so scripts call `armPointerLock()` and the actual
 * `requestPointerLock()` runs synchronously inside the next mousedown.
 */
class InputManager {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();
  private mouseButtons = new Set<number>();
  private mousePressedThisFrame = new Set<number>();
  private mouseReleasedThisFrame = new Set<number>();

  private accumMouseDX = 0;
  private accumMouseDY = 0;
  private accumWheel = 0;

  // Frame-stable snapshots — read by scripts.
  private frameMouseDX = 0;
  private frameMouseDY = 0;
  private frameWheel = 0;

  private target: HTMLElement | null = null;
  private listeners: Array<() => void> = [];

  /**
   * When true, the next mousedown synchronously requests pointer lock. Set
   * by `input.lockPointer()` from a script; cleared by the lock event or
   * by an explicit `unlockPointer()` call.
   */
  private armPointerLockFlag = false;

  install(target: HTMLElement) {
    this.uninstall();
    this.target = target;
    target.tabIndex = target.tabIndex >= 0 ? target.tabIndex : 0;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditable(document.activeElement)) return;
      if (e.code === "Tab") return; // handled by the global mode toggle
      if (!this.down.has(e.code)) {
        this.pressedThisFrame.add(e.code);
        this.down.add(e.code);
      }
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (this.down.delete(e.code)) {
        this.releasedThisFrame.add(e.code);
      }
    };
    const onBlur = () => {
      // Lost focus — release everything so a "stuck" key doesn't survive.
      for (const code of this.down) this.releasedThisFrame.add(code);
      for (const btn of this.mouseButtons) this.mouseReleasedThisFrame.add(btn);
      this.down.clear();
      this.mouseButtons.clear();
    };
    const onMouseDown = (e: MouseEvent) => {
      // Focus the viewport so subsequent keydowns route here.
      try {
        target.focus();
      } catch {
        /* element might be detached */
      }
      if (!this.mouseButtons.has(e.button)) {
        this.mousePressedThisFrame.add(e.button);
        this.mouseButtons.add(e.button);
      }
      // CRITICAL: pointer lock must run inside this synchronous user
      // gesture handler. Calling it from a rAF (script.update) sometimes
      // fails with "user activation is required".
      if (this.armPointerLockFlag && !document.pointerLockElement) {
        this.armPointerLockFlag = false;
        try {
          target.requestPointerLock?.();
        } catch {
          /* some browsers throw on rapid re-lock */
        }
      }
      // Don't suppress the event entirely (so React DOM listeners still
      // fire if any), but stop the browser from picking up middle-click
      // autoscroll etc.
      if (e.button === 1) e.preventDefault();
    };
    const onMouseUp = (e: MouseEvent) => {
      if (this.mouseButtons.delete(e.button)) {
        this.mouseReleasedThisFrame.add(e.button);
      }
    };
    const onMouseMove = (e: MouseEvent) => {
      this.accumMouseDX += e.movementX;
      this.accumMouseDY += e.movementY;
    };
    const onWheel = (e: WheelEvent) => {
      this.accumWheel += e.deltaY;
      e.preventDefault();
    };
    const onContextMenu = (e: MouseEvent) => {
      // Right-click is a useful input — don't pop the browser menu.
      e.preventDefault();
    };
    const onPointerLockChange = () => {
      // If the user pressed Esc the lock is released; make sure we don't
      // immediately re-acquire it without an explicit script request.
      if (!document.pointerLockElement) this.armPointerLockFlag = false;
    };

    // All listeners attach to `window` in the capture phase so R3F's
    // canvas-internal pointer system can't stop propagation before we see
    // the event. (R3F uses non-capture listeners on the canvas element.)
    const w = window;
    w.addEventListener("keydown", onKeyDown, true);
    w.addEventListener("keyup", onKeyUp, true);
    w.addEventListener("blur", onBlur);
    w.addEventListener("mousedown", onMouseDown, true);
    w.addEventListener("mouseup", onMouseUp, true);
    w.addEventListener("mousemove", onMouseMove, true);
    w.addEventListener("wheel", onWheel, { capture: true, passive: false });
    w.addEventListener("contextmenu", onContextMenu, true);
    document.addEventListener("pointerlockchange", onPointerLockChange);

    this.listeners.push(() => w.removeEventListener("keydown", onKeyDown, true));
    this.listeners.push(() => w.removeEventListener("keyup", onKeyUp, true));
    this.listeners.push(() => w.removeEventListener("blur", onBlur));
    this.listeners.push(() => w.removeEventListener("mousedown", onMouseDown, true));
    this.listeners.push(() => w.removeEventListener("mouseup", onMouseUp, true));
    this.listeners.push(() => w.removeEventListener("mousemove", onMouseMove, true));
    this.listeners.push(() => w.removeEventListener("wheel", onWheel, true));
    this.listeners.push(() => w.removeEventListener("contextmenu", onContextMenu, true));
    this.listeners.push(() =>
      document.removeEventListener("pointerlockchange", onPointerLockChange),
    );
  }

  uninstall() {
    for (const l of this.listeners) l();
    this.listeners = [];
    this.target = null;
    this.down.clear();
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouseButtons.clear();
    this.mousePressedThisFrame.clear();
    this.mouseReleasedThisFrame.clear();
    this.accumMouseDX = 0;
    this.accumMouseDY = 0;
    this.accumWheel = 0;
    this.frameMouseDX = 0;
    this.frameMouseDY = 0;
    this.frameWheel = 0;
    this.armPointerLockFlag = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Roll accumulated deltas into the frame snapshot. */
  beginFrame() {
    this.frameMouseDX = this.accumMouseDX;
    this.frameMouseDY = this.accumMouseDY;
    this.frameWheel = this.accumWheel;
    this.accumMouseDX = 0;
    this.accumMouseDY = 0;
    this.accumWheel = 0;
  }

  /** Clear per-frame edge sets after scripts have run. */
  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mousePressedThisFrame.clear();
    this.mouseReleasedThisFrame.clear();
  }

  api(): InputApi {
    const m = this;
    return {
      key: (code) => m.down.has(code),
      keyPressed: (code) => m.pressedThisFrame.has(code),
      keyReleased: (code) => m.releasedThisFrame.has(code),
      mouseButton: (btn) => m.mouseButtons.has(btn),
      mouseButtonPressed: (btn) => m.mousePressedThisFrame.has(btn),
      mouseButtonReleased: (btn) => m.mouseReleasedThisFrame.has(btn),
      get mouseDeltaX() {
        return m.frameMouseDX;
      },
      get mouseDeltaY() {
        return m.frameMouseDY;
      },
      get wheelDelta() {
        return m.frameWheel;
      },
      lockPointer: () => {
        if (document.pointerLockElement) return;
        // Try immediately — works in most browsers if a user gesture
        // happened within the last few ms (which is the typical case
        // when a script calls this from `update` right after a click).
        // Some browsers reject this asynchronously; arm the flag so the
        // NEXT mousedown will also acquire the lock, which is a real
        // synchronous user-gesture and always succeeds.
        m.armPointerLockFlag = true;
        const p = m.target?.requestPointerLock?.();
        if (p && typeof (p as Promise<void>).catch === "function") {
          (p as Promise<void>).catch(() => {
            /* fine — we'll get it on the next click */
          });
        }
      },
      unlockPointer: () => {
        m.armPointerLockFlag = false;
        if (document.pointerLockElement) document.exitPointerLock();
      },
      get pointerLocked() {
        return document.pointerLockElement != null;
      },
    };
  }
}

// Keys whose default browser behavior would interfere with play (scrolling
// the page, switching tabs, etc.). We swallow these only when a key is
// pressed while focus is on the viewport.
const BLOCK_DEFAULT = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
]);

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return (el as HTMLElement).isContentEditable === true;
}

export const inputManager = new InputManager();
