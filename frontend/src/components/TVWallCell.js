import React, { useRef, useState, useMemo, useCallback } from 'react';
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
  seededRand,
} from './universeVariants';

// Sculpture fits the right half of a 4:3 cell — a 2:3 portrait canvas.
// Camera back far enough for the widest variants (Asteroid belt extends to
// radius * 2.5) without clipping the canvas edges.
const CELL_SCULPTURE_RADIUS = 1.0;
const CELL_CAMERA_Z = 9;
const CELL_BLOOM_INTENSITY = 0.9;           // slightly under the network's 1.2

function AutoRotate({ children, speedX, speedY }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += speedY * dt;
    ref.current.rotation.x += speedX * dt;
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

// At/above 1M, abbreviate as `X.XXX M` rounded UP to 3 decimals so the panel
// never overflows. Below 1M we keep the full count for fidelity.
function formatCases(n) {
  if (n >= 1_000_000) {
    return (Math.ceil(n / 1000) / 1000).toFixed(3) + ' M';
  }
  return n.toLocaleString();
}

// Single 3×3-grid cell. Left half = info panel, right half = isolated 3D sculpture.
// `variantIndex` picks the sculpture by displayOrder (collision-free across 9
// universes); falling back to a hash of the universe _id only if no index is
// supplied. Matches the Topology View's index-based dispatch.
export default function TVWallCell({ universe, variantIndex, delta = 0, lastChangedAt }) {
  // Force-remount the canvas if Three.js can't auto-recover from context loss.
  // Defensive for a 24/7 wall. We give the browser a second to restore the
  // context naturally before tearing down — without this delay an immediate
  // remount during transient context pressure (e.g. HMR) creates a loop.
  const [canvasKey, setCanvasKey] = useState(0);
  const onCanvasCreated = useCallback(({ gl }) => {
    const canvas = gl.domElement;
    let pendingRemount = null;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      if (pendingRemount) clearTimeout(pendingRemount);
      pendingRemount = setTimeout(() => setCanvasKey(k => k + 1), 1500);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      if (pendingRemount) { clearTimeout(pendingRemount); pendingRemount = null; }
    });
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

  // Per-universe rotation speeds — seeded from the universe id (or slot index
  // when no universe is mounted) so each cell is stable across reloads but
  // visually distinct from its neighbours. Y is the dominant spin; X is
  // slower so the sculpture doesn't tumble chaotically. We mix the hash with
  // a Knuth-style constant and discard a few warm-up values because the LCG's
  // first outputs correlate across similar input seeds (which would make all
  // 9 cells spin at nearly the same Y speed).
  const rotation = useMemo(() => {
    const seed = universe?._id?.toString() ?? `slot-${variantIndex ?? 0}`;
    const mixed = (hashId(seed) * 2654435761) >>> 0;
    const rand = seededRand(mixed);
    rand(); rand(); rand(); // decorrelate
    // Randomly flip direction so neighbours don't all turn the same way.
    const dirY = rand() < 0.5 ? -1 : 1;
    const dirX = rand() < 0.5 ? -1 : 1;
    return {
      speedY: dirY * (0.22 + rand() * 0.45),   // |0.22..0.67| rad/s
      speedX: dirX * (0.05 + rand() * 0.28),   // |0.05..0.33| rad/s
    };
  }, [universe?._id, variantIndex]);

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
  // Prefer the supplied variantIndex (collision-free across 9 cells).
  // Fall back to the id hash for safety if the prop is missing.
  const idxSource = Number.isInteger(variantIndex) ? variantIndex : hashId(seed);
  const safeIndex = ((idxSource % UNIVERSE_VARIANTS.length) + UNIVERSE_VARIANTS.length) % UNIVERSE_VARIANTS.length;
  const Variant   = UNIVERSE_VARIANTS[safeIndex];

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
            {formatCases(displayedCases)}
          </div>
          <div className="tv-wall-cell__cases-unit">iFLU CASES</div>
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
          <AutoRotate speedX={rotation.speedX} speedY={rotation.speedY}>
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
