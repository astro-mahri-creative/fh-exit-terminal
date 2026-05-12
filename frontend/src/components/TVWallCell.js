import React, { useRef, useState, useCallback } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import useSteppedCountUp from '../hooks/useSteppedCountUp';
import {
  STEPPED_COUNT_STEPS,
  STEPPED_COUNT_DURATION_MS,
  STATUS_COLORS,
  STATUS_EMISSIVE,
  UNIVERSE_VARIANTS,
  hashId,
} from './universeVariants';

// Sculpture fits the right half of a 4:3 cell — a 2:3 portrait canvas.
// Camera back far enough for the widest variants (Asteroid belt extends to
// radius * 2.5) without clipping the canvas edges.
const CELL_SCULPTURE_RADIUS = 1.0;
const CELL_CAMERA_Z = 9;
const CELL_AUTO_ROTATE_SPEED = 0.4;         // matches CONFIG.autoRotateSpeed
const CELL_BLOOM_INTENSITY = 0.9;           // slightly under the network's 1.2

function AutoRotate({ children, speed = CELL_AUTO_ROTATE_SPEED }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += speed * dt;
  });
  return <group ref={ref}>{children}</group>;
}

function formatTime(date) {
  if (!date) return null;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Single 3×3-grid cell. Left half = info panel, right half = isolated 3D sculpture.
export default function TVWallCell({ universe, delta = 0, lastChangedAt }) {
  // Force-remount the canvas on WebGL context loss — defensive for a 24/7 wall.
  const [canvasKey, setCanvasKey] = useState(0);
  const onCanvasCreated = useCallback(({ gl }) => {
    const handler = (e) => {
      e.preventDefault();
      setCanvasKey(k => k + 1);
    };
    gl.domElement.addEventListener('webglcontextlost', handler);
  }, []);

  // Compute everything regardless of `universe` so hook order is stable.
  const safeCurrent = universe?.currentCases ?? 0;
  const displayedCases = useSteppedCountUp(
    safeCurrent - delta,
    safeCurrent,
    STEPPED_COUNT_STEPS,
    STEPPED_COUNT_DURATION_MS,
    !!universe && delta !== 0,
    0,
  );

  // NO-SIGNAL placeholder when this cell has no universe assigned.
  if (!universe) {
    return (
      <div className="tv-wall-cell">
        <div className="tv-wall-cell__panel terminal-panel">
          <div className="tv-wall-cell__name" style={{ color: 'var(--text-dim)' }}>—</div>
          <div className="tv-wall-cell__status" style={{ color: 'var(--text-dim)' }}>NO SIGNAL</div>
        </div>
        <div className="tv-wall-cell__canvas" />
      </div>
    );
  }

  const color    = STATUS_COLORS[universe.status] || STATUS_COLORS.COMPROMISED;
  const emissive = STATUS_EMISSIVE[universe.status] || 1.0;
  const seed     = universe._id.toString();
  const Variant  = UNIVERSE_VARIANTS[hashId(seed) % UNIVERSE_VARIANTS.length];

  const deltaClass =
    delta > 0 ? 'cases-up'
    : delta < 0 ? 'cases-down'
    : '';
  const deltaSign = delta > 0 ? '+' : '';
  const lastChangedLabel = formatTime(lastChangedAt);

  return (
    <div className="tv-wall-cell">
      <div className="tv-wall-cell__panel terminal-panel">
        <div>
          <div className="tv-wall-cell__name" style={{ color }}>{universe.name}</div>
          <div className="tv-wall-cell__sublabel">DIMENSION ID</div>
        </div>

        <div>
          <div className={`tv-wall-cell__cases ${deltaClass}`}>
            {displayedCases.toLocaleString()}
            <span className="tv-wall-cell__cases-unit"> iFLU</span>
          </div>
          <div className="tv-wall-cell__delta">
            {delta !== 0
              ? <>{delta > 0 ? '▲' : '▼'} {deltaSign}{delta.toLocaleString()} at {lastChangedLabel}</>
              : lastChangedLabel
                ? <>· last {lastChangedLabel}</>
                : <>· idle</>}
          </div>
        </div>

        <div className="tv-wall-cell__status" style={{ color }}>{universe.status}</div>
      </div>

      <div className="tv-wall-cell__canvas">
        <Canvas
          key={canvasKey}
          camera={{ position: [0, 0, CELL_CAMERA_Z], fov: 50 }}
          gl={{ antialias: true, alpha: true }}
          onCreated={onCanvasCreated}
          style={{ position: 'absolute', inset: 0 }}
        >
          <ambientLight intensity={0.08} />
          <pointLight position={[0, 0, 0]} intensity={0.6} color="#aac4ff" decay={2} />
          <Stars radius={30} depth={20} count={200} factor={2} saturation={0.12} fade speed={0.3} />
          <AutoRotate>
            <Variant
              radius={CELL_SCULPTURE_RADIUS}
              color={color}
              emissive={emissive}
              isHovered={false}
              seed={seed}
            />
          </AutoRotate>
          <EffectComposer multisampling={0}>
            <Bloom intensity={CELL_BLOOM_INTENSITY} luminanceThreshold={0.15} luminanceSmoothing={0.9} mipmapBlur />
          </EffectComposer>
        </Canvas>
      </div>
    </div>
  );
}
