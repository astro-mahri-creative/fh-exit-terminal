import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force-3d';
import { networkService } from '../services/api';
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
  nodeRadiusMin:        0.55,   // enlarged
  nodeRadiusMax:        2.0,    // enlarged
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

const STATUS_COLORS = {
  ACTIVE:       '#9e9e9e',
  OPTIMIZED:    '#b0bec5',
  COMPROMISED:  '#e6911a',
  QUARANTINED:  '#c94040',
  LIBERATED:    '#a0784a',
  TRANSCENDENT: '#9575cd',
};

const STATUS_EMISSIVE = {
  ACTIVE:       1.0,
  OPTIMIZED:    1.8,
  COMPROMISED:  2.2,
  QUARANTINED:  2.4,
  LIBERATED:    1.6,
  TRANSCENDENT: 3.0,
};

// Label offset in CSS px (pre Html distanceFactor scaling).
// translateX is always screen-right because Html faces the camera.
// These are generous — erring well clear of satellites and shells.
const VARIANT_LABEL_OFFSET = [
  // 0: Nebula — satellites reach radius*2.8; use large clearance
  (r) => Math.round(r * 95 + 55),
  // 1: Pulsing — outer shell reaches radius*1.35; still generous
  (r) => Math.round(r * 68 + 45),
];

// ─── Variant 0: Nebula Cluster ─────────────────────────────────────────────
// Core sphere with faint atmosphere + 3 satellites in tilted circular orbits
function VariantNebula({ radius, color, emissive, isHovered }) {
  const sat0 = useRef();
  const sat1 = useRef();
  const sat2 = useRef();
  const satRefs = [sat0, sat1, sat2];

  const specs = useMemo(() => {
    const makeOrbit = (axArr, speed, dist, size, t0) => {
      const axis = new THREE.Vector3(...axArr).normalize();
      const tmp  = Math.abs(axis.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      const u = tmp.clone().sub(axis.clone().multiplyScalar(tmp.dot(axis))).normalize();
      const v = axis.clone().cross(u).normalize();
      return { u, v, speed, dist, size, t: t0 };
    };
    return [
      makeOrbit([1,   0.4, 0  ], 0.65, radius * 2.2, radius * 0.34, 0),
      makeOrbit([0.3, 1,   0.6], 0.42, radius * 2.8, radius * 0.26, 2.1),
      makeOrbit([0.7, 0.1, 1  ], 0.85, radius * 1.95,radius * 0.20, 4.2),
    ];
  }, [radius]);

  useFrame((_, dt) => {
    specs.forEach((s, i) => {
      s.t += s.speed * dt;
      const ref = satRefs[i].current;
      if (ref) {
        const c = Math.cos(s.t), si = Math.sin(s.t);
        ref.position.set(
          (s.u.x * c + s.v.x * si) * s.dist,
          (s.u.y * c + s.v.y * si) * s.dist,
          (s.u.z * c + s.v.z * si) * s.dist,
        );
      }
    });
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      {/* Atmosphere glow — backside, large transparent shell */}
      <mesh>
        <sphereGeometry args={[radius * 1.48, 20, 20]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 0.22}
          transparent opacity={0.10} roughness={1} side={THREE.BackSide}
        />
      </mesh>

      {/* Core */}
      <mesh>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI}
          roughness={0.28} metalness={0.22}
        />
      </mesh>

      {/* Orbiting satellites */}
      {specs.map((s, i) => (
        <mesh key={i} ref={satRefs[i]}>
          <sphereGeometry args={[s.size, 12, 12]} />
          <meshStandardMaterial
            color={color} emissive={color}
            emissiveIntensity={eI * (0.80 - i * 0.08)}
            roughness={0.35}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Variant 1: Pulsing Energy Core ────────────────────────────────────────
// Rotating solid core + two independent breathing shells at different phases
function VariantPulsing({ radius, color, emissive, isHovered }) {
  const coreRef   = useRef();
  const shell1Ref = useRef();
  const shell2Ref = useRef();
  const tRef      = useRef(0);

  useFrame((_, dt) => {
    tRef.current += dt;
    const t = tRef.current;
    if (coreRef.current)   coreRef.current.rotation.y   += 0.010 * dt * 60;
    if (shell1Ref.current) {
      const s1 = 1 + Math.sin(t * 2.0) * 0.08;
      shell1Ref.current.scale.setScalar(s1);
    }
    if (shell2Ref.current) {
      const s2 = 1 + Math.sin(t * 1.3 + 1.5) * 0.12;
      shell2Ref.current.scale.setScalar(s2);
    }
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      {/* Outer slow-breathing shell */}
      <mesh ref={shell2Ref}>
        <sphereGeometry args={[radius * 1.55, 20, 20]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 0.20}
          transparent opacity={0.10} roughness={0} side={THREE.BackSide}
        />
      </mesh>

      {/* Inner faster-breathing shell */}
      <mesh ref={shell1Ref}>
        <sphereGeometry args={[radius * 1.3, 24, 24]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 0.38}
          transparent opacity={0.18} roughness={0} side={THREE.BackSide}
        />
      </mesh>

      {/* Solid rotating core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.35}
          roughness={0.06} metalness={0.52}
        />
      </mesh>
    </group>
  );
}

const UNIVERSE_VARIANTS = [VariantNebula, VariantPulsing];

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
function UniverseNode({ position, universe, radius, interactive, onHover, isHovered }) {
  const color        = STATUS_COLORS[universe.status] || STATUS_COLORS.ACTIVE;
  const emissive     = STATUS_EMISSIVE[universe.status] || 1.0;
  const variantIndex = (universe.displayOrder ?? 0) % 2;
  const Variant      = UNIVERSE_VARIANTS[variantIndex];
  const labelOffsetPx = VARIANT_LABEL_OFFSET[variantIndex](radius);

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

      <Variant radius={radius} color={color} emissive={emissive} isHovered={isHovered} />

      {/* Label — always screen-right via CSS translateX */}
      <Html distanceFactor={22} zIndexRange={[1, 2]}>
        <div
          className="universe-node-label"
          style={{
            transform: `translateX(${labelOffsetPx}px) translateY(-50%)`,
            opacity: isHovered ? 1 : 0.88,
          }}
        >
          <div className="label-name"   style={{ color }}>{universe.name}</div>
          <div className="label-cases">{universe.currentCases?.toLocaleString()} iFLU</div>
          <div className="label-status" style={{ color }}>{universe.status}</div>
        </div>
      </Html>
    </group>
  );
}

// ─── Scene Contents ────────────────────────────────────────────────────────
function NetworkScene({ networkData, interactive, onHover }) {
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

    const positions = {};
    nodes.forEach(n => { positions[n.id] = [n.x ?? 0, n.y ?? 0, n.z ?? 0]; });

    const maxWeight = Math.max(1, ...links.map(l => l.weight));

    return { universes, links, positions, maxWeight };
  }, [networkData]);

  const [hovered, setHovered] = useState(null);

  // Must be called before any early return to respect hooks rules
  const universeColors = useMemo(() => {
    if (!layout) return {};
    return Object.fromEntries(
      layout.universes.map(u => [u._id.toString(), STATUS_COLORS[u.status] || STATUS_COLORS.ACTIVE])
    );
  }, [layout]);

  const handleHover = (u) => {
    setHovered(u ? u._id : null);
    onHover && onHover(u);
  };

  if (!layout) return null;

  const { universes, links, positions, maxWeight } = layout;
  const cases    = universes.map(u => u.currentCases);
  const maxCases = Math.max(1, ...cases);
  const minCases = Math.min(...cases);
  const caseRange = maxCases - minCases || 1;

  return (
    <>
      <ambientLight intensity={0.08} />
      <pointLight position={[0, 0, 0]} intensity={0.6} color="#aac4ff" decay={2} />

      {/* Static edge lines */}
      {links.map((link, i) => {
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
        links={links}
        positions={positions}
        universeColors={universeColors}
      />

      {/* Nodes */}
      {universes.map(u => {
        const pos = positions[u._id.toString()];
        if (!pos) return null;
        const radius = CONFIG.nodeRadiusMin +
          ((u.currentCases - minCases) / caseRange) *
          (CONFIG.nodeRadiusMax - CONFIG.nodeRadiusMin);
        return (
          <UniverseNode
            key={u._id}
            position={pos}
            universe={u}
            radius={radius}
            interactive={interactive}
            onHover={handleHover}
            isHovered={hovered === u._id}
          />
        );
      })}
    </>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
function UniverseNetworkVisualization({ mode = 'display', autoRotate = true, onClose }) {
  const [networkData,     setNetworkData]     = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState(null);
  const [hoveredUniverse, setHoveredUniverse] = useState(null);

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
    const interval = setInterval(fetchData, CONFIG.refreshIntervalMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const interactive = mode === 'interactive';

  return (
    <div className={`universe-network-viz mode-${mode}`}>

      {loading && <div className="network-status">INITIALIZING DIMENSIONAL NETWORK...</div>}
      {error   && <div className="network-status error">{error}</div>}

      {!loading && networkData && (
        <Canvas
          camera={{ position: [0, 0, CONFIG.cameraDistance], fov: CONFIG.cameraFOV }}
          gl={{ antialias: true, alpha: true }}
          style={{ position: 'absolute', inset: 0 }}
        >
          <NetworkScene
            networkData={networkData}
            interactive={interactive}
            onHover={setHoveredUniverse}
          />
          <OrbitControls
            autoRotate={autoRotate}
            autoRotateSpeed={CONFIG.autoRotateSpeed}
            enableZoom={interactive}
            enablePan={false}
            maxDistance={38}
            minDistance={8}
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
          <div className="network-title">DIMENSIONAL NETWORK</div>
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
          [ CLOSE NETWORK ]
        </button>
      )}
    </div>
  );
}

export default UniverseNetworkVisualization;
