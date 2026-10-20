import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import styles from './BarberPoleHero.module.css';

const COLORS = {
  maroon: '#7A3B3B',
  cream: '#FFFAF2',
  dark: '#2A1D1A',
  brass: '#A88B6E',
};

const POLE_HEIGHT = 3.4;
const POLE_RADIUS = 0.5;

function createStripeTexture() {
  const size = 256;
  const band = size / 4;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  [COLORS.maroon, COLORS.cream, COLORS.dark, COLORS.cream].forEach((color, index) => {
    const start = index * band;
    const end = start + band;
    context.fillStyle = color;
    [-size, 0, size].forEach((offset) => {
      context.beginPath();
      context.moveTo(start + offset, 0);
      context.lineTo(end + offset, 0);
      context.lineTo(end + offset - size, size);
      context.lineTo(start + offset - size, size);
      context.closePath();
      context.fill();
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.repeat.set(2, (2 * POLE_HEIGHT) / (2 * Math.PI * POLE_RADIUS));
  return texture;
}

function createShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function PoleScene({ reducedMotion, pointer }) {
  const pole = useRef(null);
  const stripedMesh = useRef(null);
  const stripes = useMemo(() => createStripeTexture(), []);
  const shadow = useMemo(() => createShadowTexture(), []);
  const darkMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.dark, roughness: 0.4, metalness: 0.4 }), []);
  const brassMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: COLORS.brass, roughness: 0.3, metalness: 0.7 }), []);

  useFrame((_, delta) => {
    if (reducedMotion) return;
    const step = Math.min(delta, 0.1);
    if (stripedMesh.current?.material.map) {
      stripedMesh.current.material.map.offset.y -= step * 0.35;
    }
    if (pole.current) {
      const easing = 1 - Math.exp(-4 * step);
      pole.current.rotation.z += (-pointer.current.x * 0.12 - pole.current.rotation.z) * easing;
      pole.current.rotation.x += (-pointer.current.y * 0.1 - pole.current.rotation.x) * easing;
    }
  });

  const capY = POLE_HEIGHT / 2 + 0.17;

  return (
    <>
      <ambientLight intensity={0.8} />
      <directionalLight intensity={2.2} position={[3, 4, 5]} />
      <directionalLight color={COLORS.brass} intensity={0.7} position={[-4, 1, 2]} />
      <directionalLight intensity={0.8} position={[0, 2, -4]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.3, 0]}>
        <planeGeometry args={[2.6, 2.6]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>

      <group ref={pole}>
        <mesh ref={stripedMesh}>
          <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 64, 1, true]} />
          <meshStandardMaterial map={stripes} roughness={0.35} metalness={0.05} side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <cylinderGeometry args={[POLE_RADIUS + 0.04, POLE_RADIUS + 0.04, POLE_HEIGHT, 64, 1, true]} />
          <meshStandardMaterial color={0xffffff} transparent opacity={0.12} roughness={0.05} metalness={0.2} depthWrite={false} />
        </mesh>

        <mesh position={[0, capY, 0]} material={darkMaterial}>
          <cylinderGeometry args={[0.6, 0.6, 0.34, 48]} />
        </mesh>
        <mesh position={[0, capY + 0.17, 0]} rotation={[Math.PI / 2, 0, 0]} material={brassMaterial}>
          <torusGeometry args={[0.6, 0.035, 16, 64]} />
        </mesh>
        <mesh position={[0, capY + 0.5, 0]} material={brassMaterial}>
          <sphereGeometry args={[0.38, 48, 48]} />
        </mesh>
        <mesh position={[0, -capY, 0]} material={darkMaterial}>
          <cylinderGeometry args={[0.6, 0.6, 0.34, 48]} />
        </mesh>
        <mesh position={[0, -capY - 0.17, 0]} rotation={[Math.PI / 2, 0, 0]} material={brassMaterial}>
          <torusGeometry args={[0.6, 0.035, 16, 64]} />
        </mesh>
      </group>
    </>
  );
}

export default function BarberPoleHero() {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const pointer = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    const update = (event) => setReducedMotion(event.matches);
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);

  function trackPointer(event) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    const y = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
    pointer.current = { x, y: -y };
    event.currentTarget.style.setProperty('--card-tilt-x', `${y * 4}deg`);
    event.currentTarget.style.setProperty('--card-tilt-y', `${x * 5}deg`);
  }

  function resetPointer(event) {
    pointer.current = { x: 0, y: 0 };
    event.currentTarget.style.setProperty('--card-tilt-x', '0deg');
    event.currentTarget.style.setProperty('--card-tilt-y', '0deg');
  }

  return (
    <div
      className={styles.card}
      role="img"
      aria-label="FlowCut barber pole"
      onPointerMove={reducedMotion ? undefined : trackPointer}
      onPointerLeave={resetPointer}
    >
      <Canvas camera={{ fov: 35, position: [0, 0, 9.5] }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }} frameloop="always">
        <PoleScene reducedMotion={reducedMotion} pointer={pointer} />
      </Canvas>
    </div>
  );
}
