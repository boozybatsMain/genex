import type { GameObjectDef } from "@poc/shared";
import { useEditor } from "../state/store";

/**
 * Renders a single scene object. The camera object draws as a wireframe
 * gizmo (frustum-ish pyramid) so the user can see where the Play view sits
 * while editing.
 */
export function SceneObject({ object }: { object: GameObjectDef }) {
  const { selectedId, selectObject, mode } = useEditor();
  const selected = object.id === selectedId;
  const { position, rotation, scale } = object.transform;
  const color = selected ? "#ffaa00" : "#88aaff";

  // Don't render the camera gizmo while in play mode (we're *inside* it).
  if (object.meshType === "camera" && mode === "play") return null;

  // In Play Mode the scene is "live" — clicks belong to the game, not the
  // editor. Suppress selection and raycast hits so LMB / RMB / mousedown
  // reach the input manager unimpeded.
  const playMode = mode === "play";
  // No-op raycast: keeps the mesh visible but invisible to R3F's pointer
  // event system, so mousedown/mouseup bubble all the way to the wrapper.
  const noRaycast = playMode ? noopRaycast : undefined;

  return (
    <group
      position={[position.x, position.y, position.z]}
      rotation={[rotation.x, rotation.y, rotation.z]}
      scale={[scale.x, scale.y, scale.z]}
      onClick={
        playMode
          ? undefined
          : (e) => {
              e.stopPropagation();
              selectObject(object.id);
            }
      }
    >
      {object.meshType === "cube" && (
        <mesh raycast={noRaycast}>
          <boxGeometry />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {object.meshType === "sphere" && (
        <mesh raycast={noRaycast}>
          <sphereGeometry args={[0.5, 24, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {object.meshType === "cylinder" && (
        <mesh raycast={noRaycast}>
          <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {object.meshType === "camera" && <CameraGizmo color={selected ? "#ffaa00" : "#7fdcff"} />}
    </group>
  );
}

const noopRaycast = () => {};

/**
 * Wireframe pyramid pointing along -Z (Three.js camera forward), with a
 * little square at the lens position. Picks the same color as the selection
 * highlight when the camera is selected.
 */
function CameraGizmo({ color }: { color: string }) {
  return (
    <group>
      {/* Pyramid frustum: cone with 4 radial segments looks like a square
          pyramid, rotated so its apex points down -Z. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.2]}>
        <coneGeometry args={[0.35, 0.7, 4, 1, true]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
      <mesh>
        <boxGeometry args={[0.4, 0.3, 0.3]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
    </group>
  );
}
