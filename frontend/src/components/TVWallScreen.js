import React, { useState, useEffect, useCallback, useLayoutEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import useUniverses from '../hooks/useUniverses';
import TVWallPanel from './TVWallPanel';
import TVWallSculpture from './TVWallSculpture';
import './TVWallScreen.css';

const GRID_CELLS = 9;

// How often the wall reshuffles which universe each CRT is "tuned" to. Every
// tick, all 9 cells get a fresh random slot→universe assignment at once.
const SHUFFLE_INTERVAL_MS = 12000;

// Fisher–Yates permutation of [0..n-1] used to map each grid slot to a
// universe index. Returns a brand-new array so it can be dropped into state.
function shuffledOrder(n) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// World rectangle the orthographic camera covers — matches the wall's 4:3
// aspect. The 3×3 grid and per-cell sculpture positions are derived from it.
const WALL_W = 12;

// Each sculpture sits centered in the RIGHT half of its cell (cell is 4×3;
// right-half center is +1 in x from cell center). Row 0 is the top row.
const SCULPTURE_POSITIONS = Array.from({ length: GRID_CELLS }, (_, i) => {
  const r = Math.floor(i / 3);
  const c = i % 3;
  return [(c - 1) * 4 + 1, (1 - r) * 3, 0];
});

// Drives the orthographic camera's zoom so the WALL_W-wide world rect maps
// exactly onto the canvas at any pixel size. R3F's orthographic frustum
// defaults to canvas pixels with zoom = 1, so zoom = pixelWidth / WALL_W.
// useLayoutEffect avoids a one-frame wrong-scale flash.
function CameraRig() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  useLayoutEffect(() => {
    camera.zoom = size.width / WALL_W;
    camera.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

// Display-only kiosk view: 4:3 wall, 3×3 grid, each cell shows one universe.
// A single shared WebGL canvas renders all 9 sculptures as a flat grid; the
// HTML info panels are overlaid on top via z-index. Polls /api/universes
// every 10s. See plan file for the single-canvas rationale.
export default function TVWallScreen() {
  const { universes, deltas, lastChangedAt, loading, error } = useUniverses(10000);

  // One shared context — remount the whole canvas once on loss. No 1.5s delay
  // and no webglcontextrestored cancellation: R3F + postprocessing do not
  // auto-rebuild GPU state after a bare restore, so a clean remount is the
  // only reliable recovery.
  const [canvasKey, setCanvasKey] = useState(0);
  const onCanvasCreated = useCallback(({ gl }) => {
    gl.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      setCanvasKey((k) => k + 1);
    });
  }, []);

  // Slot→universe assignment. Starts as the identity permutation so the first
  // paint matches the API's displayOrder, then reshuffles on an interval so
  // each CRT randomly "retunes" to a different universe every N seconds. Kept
  // independent of the poll so a shuffle never waits on a fetch.
  const [order, setOrder] = useState(() => Array.from({ length: GRID_CELLS }, (_, i) => i));
  useEffect(() => {
    const id = setInterval(() => setOrder(shuffledOrder(GRID_CELLS)), SHUFFLE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Universes arrive sorted by displayOrder from the API. Index through `order`
  // and pad to 9 — the physical wall only has 9 CRTs. The pad is defensive for
  // transient states (e.g. mid-deploy with an old seed) and for fewer than 9
  // universes. Keys stay by universe _id (below) so a cell's count-up animation
  // rides along with its universe across a shuffle instead of resetting.
  const padded = Array.from({ length: GRID_CELLS }, (_, i) => universes[order[i]] || null);

  return (
    <div className="tv-wall-stage">
      <div className="tv-wall">
        {!loading && (
          <Canvas
            key={canvasKey}
            orthographic
            camera={{ position: [0, 0, 10], near: 0.1, far: 100 }}
            gl={{ antialias: true, alpha: true }}
            onCreated={onCanvasCreated}
            // style (not className): R3F sets position:relative inline on its
            // container, which would beat a CSS class. Absolute removes the
            // canvas from the wall's grid flow so it sits behind all 9 cells.
            style={{ position: 'absolute', inset: 0, zIndex: 0 }}
          >
            <CameraRig />
            <ambientLight intensity={0.08} />
            <pointLight position={[0, 0, 0]} intensity={0.6} color="#aac4ff" decay={2} />
            <Stars radius={30} depth={20} count={600} factor={2} saturation={0.12} fade speed={0.3} />
            {padded.map((u, i) => (
              // variantIndex is the universe's stable index in the sorted
              // `universes` array (order[i]) — NOT the slot — so a universe's
              // sculpture shape (and its memoized spin) follows it across every
              // shuffle. Distinct per universe, so still collision-free.
              <TVWallSculpture
                key={u?._id ?? `slot-${i}`}
                universe={u}
                variantIndex={order[i]}
                position={SCULPTURE_POSITIONS[i]}
              />
            ))}
            <EffectComposer multisampling={0}>
              <Bloom
                intensity={0.9}
                luminanceThreshold={0.15}
                luminanceSmoothing={0.9}
                mipmapBlur
              />
            </EffectComposer>
          </Canvas>
        )}

        {padded.map((u, i) => (
          <div className="tv-wall-cell" key={u?._id ?? `slot-${i}`}>
            <TVWallPanel
              universe={loading ? null : u}
              delta={u ? (deltas[u._id] ?? 0) : 0}
              lastChangedAt={u ? lastChangedAt[u._id] : null}
              loading={loading}
            />
            <div className="tv-wall-cell__window" />
          </div>
        ))}
      </div>
      {error && <div className="network-status error tv-wall-error">{error}</div>}
    </div>
  );
}
