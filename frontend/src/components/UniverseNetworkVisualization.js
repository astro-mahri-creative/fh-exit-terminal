import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force-3d';
import { networkService } from '../services/api';
import useSteppedCountUp from '../hooks/useSteppedCountUp';
import {
  STEPPED_COUNT_STEPS,
  STEPPED_COUNT_DURATION_MS,
  STATUS_COLORS,
  STATUS_EMISSIVE,
  VARIANT_LABEL_OFFSET,
  UNIVERSE_VARIANTS,
} from './universeVariants';
import './UniverseNetworkVisualization.css';

// ─── Configuration ─────────────────────────────────────────────────────────
const CONFIG = {
  autoRotateSpeed:      0.4,
  cameraDistance:       18,
  cameraFOV:            60,
  bloomIntensity:       1.2,
  bloomThreshold:       0.15,
  bloomSmoothing:       0.9,
  edgeOpacityMin:       0.10,
  edgeOpacityMax:       0.42,
  nodeRadiusMin:        1.15,   // raised so the smallest universes read closer in size to the largest
  nodeRadiusMax:        2.2,    // enlarged
  nodeSphereSegments:   32,
  forceCharge:         -280,    // more repulsion to spread larger nodes apart
  forceLinkDistance:    9,      // wider spacing
  forceSimTicks:        300,
  starCount:            1400,
  starRadius:           60,
  refreshIntervalMs:    30000,
  // ~15% of the old per-edge count (was 4/edge); distributed across all edges
  particlesPerEdgeFactor: 0.6,
};

// Universe sculpture variants, status colors, helpers, and label-offset
// table live in ./universeVariants so the TV Wall view can share them.

// ─── Edge — static line only (particles are managed globally) ──────────────
function StaticEdge({ src, tgt, opacity }) {
  return (
    <Line
      points={[src, tgt]}
      color="#aac4ff"
      lineWidth={0.55}
      transparent
      opacity={opacity * 0.28}
    />
  );
}

// ─── Single energy particle travelling along an edge ───────────────────────
function EdgeParticle({ srcV, tgtV, speed, initialT, direction, color, opacity }) {
  const meshRef = useRef();
  const tRef    = useRef(initialT);

  useFrame((_, dt) => {
    tRef.current = (tRef.current + speed * dt * direction + 1) % 1;
    if (meshRef.current) {
      meshRef.current.position.lerpVectors(srcV, tgtV, tRef.current);
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.075, 5, 5]} />
      <meshStandardMaterial
        color={color} emissive={color}
        emissiveIntensity={3.2}
        transparent opacity={opacity}
      />
    </mesh>
  );
}

// ─── Global particle pool — ~15% of old per-edge count ─────────────────────
// Particles are randomly distributed across all edges.
// Each particle is colored by the universe it originates from.
function NetworkParticles({ links, positions, universeColors }) {
  const particles = useMemo(() => {
    const validLinks = links.filter(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      return positions[sid] && positions[tid];
    });
    if (!validLinks.length) return [];

    const count = Math.max(3, Math.round(validLinks.length * CONFIG.particlesPerEdgeFactor));
    const result = [];

    for (let i = 0; i < count; i++) {
      const link  = validLinks[Math.floor(Math.random() * validLinks.length)];
      const srcId = typeof link.source === 'object' ? link.source.id : link.source;
      const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
      const dir   = Math.random() > 0.5 ? 1 : -1;
      const originId = dir === 1 ? srcId : tgtId;

      result.push({
        srcV:     new THREE.Vector3(...positions[srcId]),
        tgtV:     new THREE.Vector3(...positions[tgtId]),
        direction: dir,
        speed:    0.08 + Math.random() * 0.30,
        initialT: Math.random(),
        color:    universeColors[originId] || '#aac4ff',
      });
    }
    return result;
  }, [links, positions, universeColors]);

  return (
    <>
      {particles.map((p, i) => (
        <EdgeParticle
          key={i}
          srcV={p.srcV}
          tgtV={p.tgtV}
          direction={p.direction}
          speed={p.speed}
          initialT={p.initialT}
          color={p.color}
          opacity={0.92}
        />
      ))}
    </>
  );
}

// ─── Universe Node ─────────────────────────────────────────────────────────
function UniverseNode({ position, universe, radius, interactive, onHover, isHovered, caseDelta, animateNumbers, animationDelayMs, variantIndex }) {
  const color        = STATUS_COLORS[universe.status] || STATUS_COLORS.COMPROMISED;
  const emissive     = STATUS_EMISSIVE[universe.status] || 1.0;
  const seed         = universe._id.toString();
  const safeIndex    = ((variantIndex ?? 0) % UNIVERSE_VARIANTS.length + UNIVERSE_VARIANTS.length) % UNIVERSE_VARIANTS.length;
  const Variant      = UNIVERSE_VARIANTS[safeIndex];
  const labelOffsetPx = VARIANT_LABEL_OFFSET[safeIndex](radius);

  const finalCases = universe.currentCases ?? 0;
  const startCases = finalCases - (caseDelta ?? 0);
  const displayedCases = useSteppedCountUp(
    startCases,
    finalCases,
    STEPPED_COUNT_STEPS,
    STEPPED_COUNT_DURATION_MS,
    !!animateNumbers,
    animationDelayMs ?? 0,
  );

  return (
    <group position={position}>
      {/* Invisible hit-detection sphere covering the full variant extent */}
      <mesh
        onPointerEnter={() => interactive && onHover(universe)}
        onPointerLeave={() => interactive && onHover(null)}
      >
        <sphereGeometry args={[radius * 3.4, 8, 8]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>

      <Variant radius={radius} color={color} emissive={emissive} isHovered={isHovered} seed={seed} />

      {/* Label — always screen-right via CSS translateX */}
      <Html distanceFactor={17.5} zIndexRange={[1, 2]}>
        <div
          className="universe-node-label"
          style={{
            transform: `translateX(${labelOffsetPx}px) translateY(-50%)`,
            opacity: isHovered ? 1 : 0.88,
          }}
        >
          <div className="label-name"   style={{ color }}>{universe.name}</div>
          <div className={`label-cases ${
            animateNumbers
              ? (caseDelta ?? 0) > 0 ? 'cases-up' : (caseDelta ?? 0) < 0 ? 'cases-down' : ''
              : ''
          }`}>
            {displayedCases.toLocaleString()} iFLU
          </div>
          <div className="label-status" style={{ color }}>{universe.status}</div>
        </div>
      </Html>
    </group>
  );
}

// ─── OrbitControls target driver ──────────────────────────────────────────
// Drives OrbitControls' own `target` directly via its ref instead of
// overriding camera.lookAt() in a competing useFrame. The win: OrbitControls'
// internal state (target + camera spherical coords) always reflects the
// camera's actual orientation, so the moment the user grabs control there
// is NO orientation jump.
//
// Phase 1 — initial focus: target sits at the most-affected universe's
// position so OrbitControls' built-in lookAt(target) keeps that universe
// centered.
// Phase 2 — release: when autoRotate kicks in OR the user manually
// rotates, smoothly slerp the target from the focus position back to the
// cluster origin over ~1.2s. The camera orientation continues to track
// the moving target each frame so there is no visible discontinuity.
function OrbitTargetController({ orbitRef, focusPosition, releaseTrigger }) {
  const startedRef   = useRef(false);
  const releaseStart = useRef(null); // [x, y, z] target at moment of release
  const releaseTime  = useRef(0);
  const TWEEN_DUR    = 1.2; // seconds

  // Set target to focus position on initial mount. Doing this in useEffect
  // (and again every time the focus prop changes) is enough — OrbitControls
  // re-reads target during its useFrame.
  useEffect(() => {
    if (!orbitRef.current || !focusPosition || startedRef.current) return;
    orbitRef.current.target.set(focusPosition[0], focusPosition[1], focusPosition[2]);
    orbitRef.current.update();
    startedRef.current = true;
  }, [orbitRef, focusPosition]);

  // Each frame, advance the release tween if it has been triggered.
  useFrame((_, dt) => {
    if (!orbitRef.current || !releaseTrigger || !focusPosition) return;
    if (!releaseStart.current) {
      // Capture current target as the tween start point. This means a
      // partly-tweened user-interaction stop still resumes from where we
      // left off rather than snapping.
      const t = orbitRef.current.target;
      releaseStart.current = [t.x, t.y, t.z];
      releaseTime.current  = 0;
    }
    if (releaseTime.current >= TWEEN_DUR) return;
    releaseTime.current = Math.min(TWEEN_DUR, releaseTime.current + dt);
    const u = releaseTime.current / TWEEN_DUR;
    // ease-in-out cubic
    const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    orbitRef.current.target.set(
      releaseStart.current[0] * (1 - e),
      releaseStart.current[1] * (1 - e),
      releaseStart.current[2] * (1 - e),
    );
    orbitRef.current.update();
  });

  return null;
}

// ─── Scene Contents ────────────────────────────────────────────────────────
function NetworkScene({ networkData, interactive, onHover, onReady, boundingRadius, caseDeltas, animateNumbers, focusUniverseId, onFocusPosition }) {
  const layout = useMemo(() => {
    if (!networkData) return null;

    const { universes, edges: rawEdges } = networkData;
    const idSet = new Set(universes.map(u => u._id.toString()));

    const nodes = universes.map(u => ({
      id: u._id.toString(),
      x: (Math.random() - 0.5) * 12,
      y: (Math.random() - 0.5) * 12,
      z: (Math.random() - 0.5) * 12,
    }));

    const links = rawEdges
      .filter(e => idSet.has(e.source) && idSet.has(e.target))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight }));

    const sim = forceSimulation(nodes, 3)
      .force('charge',  forceManyBody().strength(CONFIG.forceCharge))
      .force('link',    forceLink(links).id(d => d.id).distance(CONFIG.forceLinkDistance).strength(0.3))
      .force('center',  forceCenter())
      .force('collide', forceCollide(3.2))
      .stop();

    for (let i = 0; i < CONFIG.forceSimTicks; i++) sim.tick();

    // Optional: scale positions inward so the furthest universe sits at
    // boundingRadius. Lets the camera be placed at a known distance and
    // actually feel "outside" the multiverse cluster.
    if (boundingRadius && boundingRadius > 0) {
      let maxR = 0;
      nodes.forEach(n => {
        const r = Math.hypot(n.x ?? 0, n.y ?? 0, n.z ?? 0);
        if (r > maxR) maxR = r;
      });
      if (maxR > boundingRadius) {
        const s = boundingRadius / maxR;
        nodes.forEach(n => { n.x = (n.x ?? 0) * s; n.y = (n.y ?? 0) * s; n.z = (n.z ?? 0) * s; });
      }
    }


    const positions = {};
    nodes.forEach(n => { positions[n.id] = [n.x ?? 0, n.y ?? 0, n.z ?? 0]; });

    const maxWeight = Math.max(1, ...links.map(l => l.weight));

    return { universes, links, positions, maxWeight };
  }, [networkData, boundingRadius]);

  // Emit the focused universe's position whenever layout/focus changes.
  // useEffect (not useLayoutEffect) is fine: LookAtFocused runs every
  // frame and falls back to default lookAt(origin) until the position
  // arrives, which happens within one render.
  useEffect(() => {
    if (!layout || !focusUniverseId || !onFocusPosition) return;
    const pos = layout.positions[focusUniverseId];
    if (pos) onFocusPosition(pos);
  }, [layout, focusUniverseId, onFocusPosition]);

  const [hovered, setHovered] = useState(null);

  // Must be called before any early return to respect hooks rules
  const universeColors = useMemo(() => {
    if (!layout) return {};
    return Object.fromEntries(
      layout.universes.map(u => {
        const id = u._id.toString();
        if (u.lastImpactDirection === 'positive') return [id, STATUS_COLORS.LIBERATED];
        if (u.lastImpactDirection === 'negative') return [id, STATUS_COLORS.PRESERVED];
        return [id, STATUS_COLORS[u.status] || STATUS_COLORS.COMPROMISED];
      })
    );
  }, [layout]);

  const readyFiredRef = useRef(false);
  useFrame(() => {
    if (!readyFiredRef.current) {
      readyFiredRef.current = true;
      onReady?.();
    }
  });

  const handleHover = (u) => {
    setHovered(u ? u._id : null);
    onHover && onHover(u);
  };

  if (!layout) return null;

  const { universes, links, positions, maxWeight } = layout;
  // Treat initializationCases as diameter — radius = initCases / 2.
  // Normalize across universes to fit within the configured radius range.
  const radii     = universes.map(u => (u.initializationCases || 1) / 2);
  const maxR      = Math.max(...radii);
  const minR      = Math.min(...radii);
  const rRange    = maxR - minR || 1;

  const lockedStatuses = new Set(['QUARANTINED', 'TRANSCENDED']);
  const lockedIds = new Set(
    universes.filter(u => lockedStatuses.has(u.status)).map(u => u._id.toString())
  );
  const activeLinks = links.filter(link => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    return !lockedIds.has(srcId) && !lockedIds.has(tgtId);
  });

  return (
    <>
      <ambientLight intensity={0.08} />
      <pointLight position={[0, 0, 0]} intensity={0.6} color="#aac4ff" decay={2} />

      {/* Static edge lines */}
      {activeLinks.map((link, i) => {
        const srcId = typeof link.source === 'object' ? link.source.id : link.source;
        const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
        const src = positions[srcId];
        const tgt = positions[tgtId];
        if (!src || !tgt) return null;
        const opacity = CONFIG.edgeOpacityMin +
          (link.weight / maxWeight) * (CONFIG.edgeOpacityMax - CONFIG.edgeOpacityMin);
        return <StaticEdge key={i} src={src} tgt={tgt} opacity={opacity} />;
      })}

      {/* Global particle pool — sparse, color-coded by origin universe */}
      <NetworkParticles
        links={activeLinks}
        positions={positions}
        universeColors={universeColors}
      />

      {/* Nodes */}
      {universes.map((u, idx) => {
        const id = u._id.toString();
        const pos = positions[id];
        if (!pos) return null;
        const uR = (u.initializationCases || 1) / 2;
      const radius = CONFIG.nodeRadiusMin +
          ((uR - minR) / rRange) *
          (CONFIG.nodeRadiusMax - CONFIG.nodeRadiusMin);
        return (
          <UniverseNode
            key={u._id}
            position={pos}
            universe={u}
            radius={radius}
            variantIndex={idx % UNIVERSE_VARIANTS.length}
            interactive={interactive}
            onHover={handleHover}
            isHovered={hovered === u._id}
            caseDelta={caseDeltas?.[id] ?? 0}
            animateNumbers={animateNumbers}
            animationDelayMs={idx * 40}
          />
        );
      })}
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
function UniverseNetworkVisualization({ mode = 'display', autoRotate = true, onClose, cameraZ, onReady, boundingRadius, caseDeltas, animateNumbers, focusUniverseId }) {
  const [networkData,     setNetworkData]     = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [hoveredUniverse, setHoveredUniverse] = useState(null);
  const [focusTarget,     setFocusTarget]     = useState(null);
  // True once the user manually rotates the orbit, OR after autoRotate
  // kicks in (i.e. the initial focus window has elapsed). Either condition
  // triggers the OrbitTargetController to slerp OrbitControls' target
  // from the focus universe back to the cluster origin.
  const [userRotated,     setUserRotated]     = useState(false);
  const orbitRef = useRef();

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const data = await networkService.get();
        if (!cancelled && data.success) setNetworkData(data);
        else if (!cancelled) setError('Failed to load network data');
      } catch {
        if (!cancelled) setError('Unable to connect to network');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();
    // Skip auto-refresh on the impact report. focusUniverseId is only set
    // in that flow, where the data is a snapshot in time and should not
    // change underneath the user — refreshing scrambles the force layout.
    if (focusUniverseId) {
      return () => { cancelled = true; };
    }
    const interval = setInterval(fetchData, CONFIG.refreshIntervalMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [focusUniverseId]);

  const interactive = mode === 'interactive';

  return (
    <div className={`universe-network-viz mode-${mode}`}>

      {loading && <div className="network-status">INITIALIZING XDIM TOPOLOGY VIEW...</div>}
      {error   && <div className="network-status error">{error}</div>}

      {!loading && networkData && (
        <Canvas
          camera={{ position: [0, 0, cameraZ ?? CONFIG.cameraDistance], fov: CONFIG.cameraFOV }}
          gl={{ antialias: true, alpha: true }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <NetworkScene
            networkData={networkData}
            interactive={interactive}
            onHover={setHoveredUniverse}
            onReady={onReady}
            boundingRadius={boundingRadius}
            caseDeltas={caseDeltas}
            animateNumbers={animateNumbers}
            focusUniverseId={focusUniverseId}
            onFocusPosition={setFocusTarget}
          />
          <OrbitControls
            ref={orbitRef}
            autoRotate={autoRotate}
            autoRotateSpeed={CONFIG.autoRotateSpeed}
            enableZoom={true}
            enableRotate={true}
            enablePan={false}
            maxDistance={Math.max(80, (cameraZ ?? CONFIG.cameraDistance) + 40)}
            minDistance={8}
            onStart={() => setUserRotated(true)}
          />
          {/* Drives OrbitControls' target so the camera looks at the
              focus universe initially, then smoothly tweens target back
              to origin once the focus phase ends — no orientation jump
              when the user grabs control. */}
          <OrbitTargetController
            orbitRef={orbitRef}
            focusPosition={focusTarget}
            releaseTrigger={autoRotate || userRotated}
          />
          <Stars
            radius={CONFIG.starRadius}
            depth={50}
            count={CONFIG.starCount}
            factor={2}
            saturation={0.12}
            fade
            speed={0.3}
          />
          <EffectComposer multisampling={0}>
            <Bloom
              intensity={CONFIG.bloomIntensity}
              luminanceThreshold={CONFIG.bloomThreshold}
              luminanceSmoothing={CONFIG.bloomSmoothing}
              mipmapBlur
            />
          </EffectComposer>
        </Canvas>
      )}

      {mode === 'display' && (
        <div className="network-header">
          <div className="network-title">XDIM TOPOLOGY VIEW</div>
          <div className="network-subtitle">LIVE STATUS · {networkData?.universes?.length ?? '—'} DIMENSIONS</div>
        </div>
      )}

      {interactive && hoveredUniverse && (
        <div className="network-tooltip">
          <div className="tooltip-name">{hoveredUniverse.name}</div>
          <div className="tooltip-cases">{hoveredUniverse.currentCases?.toLocaleString()} iFLU cases</div>
          <div
            className="tooltip-status"
            style={{ color: STATUS_COLORS[hoveredUniverse.status] }}
          >
            {hoveredUniverse.status}
          </div>
        </div>
      )}

      {onClose && (
        <button className="network-close-btn" onClick={onClose}>
          [ Back to Terminal View ]
        </button>
      )}
    </div>
  );
}

export default UniverseNetworkVisualization;
