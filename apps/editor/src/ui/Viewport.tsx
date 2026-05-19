import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { BUILTIN_CAMERA_ID } from "@poc/shared";
import { useEditor } from "../state/store";
import { SceneObject } from "./SceneObject";
import { inputManager } from "../runtime/Input";

export function Viewport() {
  const { definition, runtimeSnapshot, mode } = useEditor();
  const view = mode === "play" && runtimeSnapshot ? runtimeSnapshot : definition;
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Install / uninstall the global input listener when we toggle Play Mode.
  // The wrapper div gets focus on click so keystrokes route here.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (mode !== "play") {
      inputManager.uninstall();
      return;
    }
    inputManager.install(el);
    el.focus();
    return () => inputManager.uninstall();
  }, [mode]);

  return (
    <div
      ref={wrapperRef}
      tabIndex={0}
      style={{ width: "100%", height: "100%", outline: "none", position: "relative" }}
    >
      <Canvas camera={{ position: [4, 4, 4], fov: 50 }} style={{ background: "#222" }}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 10, 5]} intensity={1} />
        <Grid args={[20, 20]} cellColor="#444" sectionColor="#666" infiniteGrid />
        <CameraRig />
        {view?.objects.map((o) => (
          <SceneObject key={o.id} object={o} />
        ))}
      </Canvas>
      {mode === "play" && <PlayHint />}
    </div>
  );
}

/**
 * In Edit Mode this renders OrbitControls so the user can fly around the
 * scene. In Play Mode it syncs the live Three.js camera with the built-in
 * Camera object's transform every frame, so scripts attached to that
 * object can drive the view.
 */
function CameraRig() {
  const { mode } = useEditor();
  if (mode === "play") return <PlayCameraSync />;
  return <OrbitControls makeDefault />;
}

function PlayCameraSync() {
  const { runtimeSnapshot } = useEditor();
  const { camera } = useThree();
  useFrame(() => {
    const cam = runtimeSnapshot?.objects.find((o) => o.id === BUILTIN_CAMERA_ID);
    if (!cam) return;
    const { position, rotation } = cam.transform;
    camera.position.set(position.x, position.y, position.z);
    // Apply euler rotation in XYZ order to match the runtime convention.
    camera.rotation.set(rotation.x, rotation.y, rotation.z, "YXZ");
  });
  return null;
}

function PlayHint() {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: 12,
        padding: "6px 10px",
        background: "rgba(0,0,0,0.55)",
        color: "#fff",
        fontSize: 12,
        lineHeight: 1.5,
        borderRadius: 6,
        pointerEvents: "none",
        fontFamily: "system-ui, sans-serif",
        userSelect: "none",
      }}
    >
      <div style={{ opacity: 0.85 }}>
        Click to capture mouse · Esc to release · <b>Tab</b> to stop
      </div>
    </div>
  );
}
