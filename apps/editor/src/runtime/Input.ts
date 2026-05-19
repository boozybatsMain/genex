import type { InputApi } from "@poc/shared";

/**
 * Per-frame, browser-global input state. The runtime calls `installInput`
 * once when entering Play Mode, calls `beginFrame` at the top of each tick
 * (so press/release edges and motion deltas refer to *this* frame), and
 * `uninstallInput` when leaving Play Mode.
 *
 * Scripts read state through the `SceneApi.input` field. Edge state (pressed
 * / released) is correct only inside `update()`, between `beginFrame` calls.
 */
class InputManager {
  private down = new Set<string>();
  private pressedThisFrame = new Set<string>();
  private releasedThisFrame = new Set<string>();
  private mouseButtons = new Set<number>();

  private accumMouseDX = 0;
  private accumMouseDY = 0;
  private accumWheel = 0;

  // Frame-stable snapshots — read by scripts.
  private frameMouseDX = 0;
  private frameMouseDY = 0;
  private frameWheel = 0;

  private target: HTMLElement | null = null;
  private listeners: Array<() => void> = [];

  install(target: HTMLElement) {
    this.uninstall();
    this.target = target;
    target.tabIndex = target.tabIndex >= 0 ? target.tabIndex : 0;

    const onKeyDown = (e: KeyboardEvent) => {
      // Don't capture keys while the user is typing into inputs.
      if (isEditable(document.activeElement)) return;
      // Tab toggles edit/play; let it through to the global handler.
      if (e.code === "Tab") return;
      if (!this.down.has(e.code)) {
        this.pressedThisFrame.add(e.code);
        this.down.add(e.code);
      }
      // Prevent the browser scrolling on space, arrows, etc. while playing.
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
      this.down.clear();
      this.mouseButtons.clear();
    };
    const onMouseDown = (e: MouseEvent) => {
      target.focus();
      this.mouseButtons.add(e.button);
    };
    const onMouseUp = (e: MouseEvent) => {
      this.mouseButtons.delete(e.button);
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

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    target.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);
    target.addEventListener("wheel", onWheel, { passive: false });
    target.addEventListener("contextmenu", onContextMenu);

    this.listeners.push(() => window.removeEventListener("keydown", onKeyDown));
    this.listeners.push(() => window.removeEventListener("keyup", onKeyUp));
    this.listeners.push(() => window.removeEventListener("blur", onBlur));
    this.listeners.push(() => target.removeEventListener("mousedown", onMouseDown));
    this.listeners.push(() => window.removeEventListener("mouseup", onMouseUp));
    this.listeners.push(() => window.removeEventListener("mousemove", onMouseMove));
    this.listeners.push(() => target.removeEventListener("wheel", onWheel));
    this.listeners.push(() => target.removeEventListener("contextmenu", onContextMenu));
  }

  uninstall() {
    for (const l of this.listeners) l();
    this.listeners = [];
    this.target = null;
    this.down.clear();
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouseButtons.clear();
    this.accumMouseDX = 0;
    this.accumMouseDY = 0;
    this.accumWheel = 0;
    this.frameMouseDX = 0;
    this.frameMouseDY = 0;
    this.frameWheel = 0;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  /** Roll accumulated deltas into the frame snapshot and clear edge sets. */
  beginFrame() {
    this.frameMouseDX = this.accumMouseDX;
    this.frameMouseDY = this.accumMouseDY;
    this.frameWheel = this.accumWheel;
    this.accumMouseDX = 0;
    this.accumMouseDY = 0;
    this.accumWheel = 0;
    // Edges are consumed at the end of the previous frame; clear here so the
    // first frame's "pressed" still shows once.
    // (We clear in `endFrame` instead — see below.)
  }

  endFrame() {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
  }

  api(): InputApi {
    const m = this;
    return {
      key: (code) => m.down.has(code),
      keyPressed: (code) => m.pressedThisFrame.has(code),
      keyReleased: (code) => m.releasedThisFrame.has(code),
      mouseButton: (btn) => m.mouseButtons.has(btn),
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
        m.target?.requestPointerLock?.();
      },
      unlockPointer: () => {
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
