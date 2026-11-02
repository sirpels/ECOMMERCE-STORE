"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { MathUtils, Shape, Spherical, Vector3 } from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export type CameraAction = {
  kind: "left" | "right" | "zoom-in" | "zoom-out" | "reset";
  key: number;
};

const initialCameraPosition = new Vector3(3.2, 1.8, 4.5);

function ToteBag({ color }: { color: string }) {
  const shape = useMemo(() => {
    const body = new Shape();
    body.moveTo(-1.05, 0.6);
    body.lineTo(1.05, 0.6);
    body.lineTo(0.88, -0.95);
    body.lineTo(-0.88, -0.95);
    body.closePath();
    return body;
  }, []);

  return (
    <group rotation={[0, -0.3, 0]}>
      <mesh position={[0, 0, -0.3]}>
        <extrudeGeometry args={[shape, { depth: 0.6, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.035, bevelThickness: 0.035, steps: 1 }]} />
        <meshStandardMaterial color={color} roughness={0.82} metalness={0} />
      </mesh>
      <mesh position={[0, 0.61, 0]}>
        <boxGeometry args={[2.12, 0.085, 0.7]} />
        <meshStandardMaterial color={color} roughness={0.82} metalness={0} />
      </mesh>
      {[-0.39, 0.39].map((z) => (
        <mesh key={z} position={[0, 0.58, z]}>
          <torusGeometry args={[0.62, 0.07, 8, 24, Math.PI]} />
          <meshStandardMaterial color="#51463e" roughness={0.9} />
        </mesh>
      ))}
      <mesh position={[0, -1.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.3, 32]} />
        <meshBasicMaterial color="#d8d0c7" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}

function CameraControls({ action }: { action: CameraAction | null }) {
  const { camera, gl, invalidate } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);

  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.target.set(0, 0.08, 0);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = 3.3;
    controls.maxDistance = 8;
    controls.minPolarAngle = 0.35;
    controls.maxPolarAngle = Math.PI / 2;
    const onChange = () => invalidate();
    controls.addEventListener("change", onChange);
    controls.update();
    controlsRef.current = controls;
    return () => {
      controls.removeEventListener("change", onChange);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, gl, invalidate]);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls || !action) return;
    if (action.kind === "reset") {
      camera.position.copy(initialCameraPosition);
    } else {
      const spherical = new Spherical().setFromVector3(camera.position.clone().sub(controls.target));
      if (action.kind === "left") spherical.theta -= 0.3;
      if (action.kind === "right") spherical.theta += 0.3;
      if (action.kind === "zoom-in") spherical.radius *= 0.82;
      if (action.kind === "zoom-out") spherical.radius *= 1.22;
      spherical.radius = MathUtils.clamp(spherical.radius, controls.minDistance, controls.maxDistance);
      spherical.phi = MathUtils.clamp(spherical.phi, controls.minPolarAngle, controls.maxPolarAngle);
      camera.position.copy(controls.target).add(new Vector3().setFromSpherical(spherical));
    }
    controls.update();
    invalidate();
  }, [action, camera, invalidate]);

  return null;
}

export default function BagViewer({ color, cameraAction, onContextLost }: {
  color: string;
  cameraAction: CameraAction | null;
  onContextLost: () => void;
}) {
  return (
    <Canvas
      className="h-full w-full"
      frameloop="demand"
      dpr={[1, 1.5]}
      camera={{ position: initialCameraPosition.toArray(), fov: 38, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: "low-power" }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", onContextLost, { once: true });
      }}
    >
      <ambientLight intensity={1.8} />
      <directionalLight position={[3, 4, 5]} intensity={2.2} />
      <directionalLight position={[-3, 2, -2]} intensity={1} />
      <ToteBag color={color} />
      <CameraControls action={cameraAction} />
    </Canvas>
  );
}
