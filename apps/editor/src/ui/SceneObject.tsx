import type { GameObjectDef } from "@poc/shared";
import { useEditor } from "../state/store";

export function SceneObject({ object }: { object: GameObjectDef }) {
  const { selectedId, selectObject } = useEditor();
  const selected = object.id === selectedId;
  const { position, rotation, scale } = object.transform;
  const color = selected ? "#ffaa00" : "#88aaff";

  return (
    <group
      position={[position.x, position.y, position.z]}
      rotation={[rotation.x, rotation.y, rotation.z]}
      scale={[scale.x, scale.y, scale.z]}
      onClick={(e) => {
        e.stopPropagation();
        selectObject(object.id);
      }}
    >
      {object.meshType === "cube" && (
        <mesh>
          <boxGeometry />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {object.meshType === "sphere" && (
        <mesh>
          <sphereGeometry args={[0.5, 24, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
      {object.meshType === "cylinder" && (
        <mesh>
          <cylinderGeometry args={[0.5, 0.5, 1, 24]} />
          <meshStandardMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}
