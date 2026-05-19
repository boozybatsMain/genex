import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useEditor } from "../state/store";
import { SceneObject } from "./SceneObject";

export function Viewport() {
  const { definition, runtimeSnapshot, mode } = useEditor();
  const view = mode === "play" && runtimeSnapshot ? runtimeSnapshot : definition;
  return (
    <Canvas camera={{ position: [4, 4, 4], fov: 50 }} style={{ background: "#222" }}>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1} />
      <Grid args={[20, 20]} cellColor="#444" sectionColor="#666" infiniteGrid />
      <OrbitControls makeDefault />
      {view?.objects.map((o) => (
        <SceneObject key={o.id} object={o} />
      ))}
    </Canvas>
  );
}
