import { useEffect, useRef } from "react";
import { useEditor } from "../state/store";
import { RuntimeWorld } from "./RuntimeWorld";
import { invalidateScript } from "./scriptLoader";

export function useRuntime() {
  const worldRef = useRef<RuntimeWorld | null>(null);
  const { mode, definition, scripts, setRuntimeSnapshot } = useEditor();

  useEffect(() => {
    if (mode !== "play" || !definition) return;
    const cloned: typeof definition = JSON.parse(JSON.stringify(definition));
    const w = new RuntimeWorld(cloned, new Map(scripts));
    worldRef.current = w;
    const unsub = w.subscribe(setRuntimeSnapshot);
    w.start();
    return () => {
      unsub();
      w.stop();
      worldRef.current = null;
      setRuntimeSnapshot(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Hot-reload: react to scripts map changes while running
  useEffect(() => {
    if (mode !== "play" || !worldRef.current) return;
    for (const rec of scripts.values()) {
      invalidateScript(rec.id);
      worldRef.current.reloadScript(rec);
    }
  }, [scripts, mode]);
}
