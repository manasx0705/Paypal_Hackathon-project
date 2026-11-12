import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, MeshTransmissionMaterial, Environment, Sparkles, RoundedBox, Torus } from '@react-three/drei';

function CartCore() {
  const ref = useRef();
  useFrame((s, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.25;
  });
  return (
    <group ref={ref}>
      <mesh>
        <icosahedronGeometry args={[1.15, 8]} />
        <MeshDistortMaterial color="#ff9f1c" emissive="#ff7a00" emissiveIntensity={0.55} roughness={0.15} metalness={0.4} distort={0.32} speed={1.6} />
      </mesh>
      <Torus args={[1.9, 0.025, 16, 128]} rotation={[Math.PI / 2.2, 0, 0]}>
        <meshBasicMaterial color="#2ee6d6" toneMapped={false} />
      </Torus>
      <Torus args={[2.4, 0.012, 16, 128]} rotation={[Math.PI / 1.7, 0.4, 0]}>
        <meshBasicMaterial color="#ffd27a" toneMapped={false} />
      </Torus>
    </group>
  );
}

function Crate({ radius, speed, offset, y, color, size = 0.55, glass }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() * speed + offset;
    if (!ref.current) return;
    ref.current.position.set(Math.cos(t) * radius, y + Math.sin(t * 1.3) * 0.25, Math.sin(t) * radius);
    ref.current.rotation.x = t * 0.6;
    ref.current.rotation.y = t * 0.4;
  });
  return (
    <group ref={ref}>
      <Float speed={2} rotationIntensity={0.6} floatIntensity={0.6}>
        {glass ? (
          <RoundedBox args={[size, size, size]} radius={0.08} smoothness={4}>
            <MeshTransmissionMaterial backside thickness={0.4} roughness={0.05} transmission={1} ior={1.3} chromaticAberration={0.06} color={color} samples={4} resolution={256} />
          </RoundedBox>
        ) : (
          <mesh>
            <sphereGeometry args={[size * 0.55, 32, 32]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.25} metalness={0.6} />
          </mesh>
        )}
      </Float>
    </group>
  );
}

function Rig({ children }) {
  const ref = useRef();
  useFrame(({ pointer }, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += (pointer.x * 0.35 - ref.current.rotation.y) * Math.min(1, dt * 2);
    ref.current.rotation.x += (-pointer.y * 0.2 - ref.current.rotation.x) * Math.min(1, dt * 2);
  });
  return <group ref={ref}>{children}</group>;
}

export default function HeroScene({ reduced }) {
  const crates = useMemo(
    () => [
      { radius: 3.0, speed: 0.35, offset: 0, y: 0.3, color: '#2ee6d6', glass: true },
      { radius: 3.4, speed: 0.28, offset: 2.1, y: -0.6, color: '#ffb84d', glass: true },
      { radius: 2.7, speed: 0.42, offset: 4.2, y: 0.9, color: '#ffffff', glass: true, size: 0.45 },
      { radius: 3.8, speed: 0.22, offset: 1.0, y: -0.2, color: '#ff9f1c' },
      { radius: 2.9, speed: 0.5, offset: 3.3, y: -1.0, color: '#2ee6d6' },
      { radius: 3.6, speed: 0.31, offset: 5.4, y: 1.1, color: '#a78bfa' },
    ],
    [],
  );
  return (
    <Canvas camera={{ position: [0, 1.2, 7.5], fov: 45 }} dpr={[1, 1.75]} gl={{ antialias: true, alpha: true }} frameloop={reduced ? 'demand' : 'always'}>
      <ambientLight intensity={0.4} />
      <pointLight position={[4, 4, 4]} intensity={40} color="#ffb84d" />
      <pointLight position={[-4, -2, 2]} intensity={30} color="#2ee6d6" />
      <Rig>
        <CartCore />
        {crates.map((c, i) => (
          <Crate key={i} {...c} />
        ))}
        <Sparkles count={reduced ? 30 : 120} scale={[10, 6, 10]} size={2.2} speed={0.4} color="#ffd27a" />
      </Rig>
      <Environment preset="night" />
    </Canvas>
  );
}
