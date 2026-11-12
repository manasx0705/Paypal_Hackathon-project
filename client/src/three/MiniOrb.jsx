import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { MeshDistortMaterial, Sparkles } from '@react-three/drei';

function Orb() {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.4;
      ref.current.rotation.x += dt * 0.15;
    }
  });
  return (
    <group ref={ref}>
      <mesh>
        <torusKnotGeometry args={[0.8, 0.26, 160, 24]} />
        <MeshDistortMaterial color="#2ee6d6" emissive="#0ea597" emissiveIntensity={0.4} distort={0.25} speed={2} roughness={0.2} metalness={0.5} />
      </mesh>
    </group>
  );
}

export default function MiniOrb() {
  return (
    <Canvas camera={{ position: [0, 0, 3.6], fov: 45 }} dpr={[1, 1.5]} gl={{ alpha: true }}>
      <ambientLight intensity={0.5} />
      <pointLight position={[3, 3, 3]} intensity={25} color="#ffb84d" />
      <pointLight position={[-3, -2, 2]} intensity={20} color="#2ee6d6" />
      <Orb />
      <Sparkles count={40} scale={4} size={1.6} color="#ffd27a" />
    </Canvas>
  );
}
