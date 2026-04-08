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
  autoRotateSpeed:     0.4,
  cameraDistance:      18,
  cameraFOV:           60,
  bloomIntensity:      1.2,
  bloomThreshold:      0.15,
  bloomSmoothing:      0.9,
  edgeOpacityMin:      0.08,
  edgeOpacityMax:      0.38,
  nodeRadiusMin:       0.28,
  nodeRadiusMax:       1.1,
  nodeSphereSegments:  28,
  forceCharge:        -180,
  forceLinkDistance:   6,
  forceSimTicks:       260,
  starCount:           1400,
  starRadius:          60,
  refreshIntervalMs:   30000,
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

// How far the label must be pushed right (in CSS px, pre-distanceFactor-scaling)
// to clear the variant's visual extent. Indexed 0–3 matching UNIVERSE_VARIANTS order.
// Formula: visual_extent_in_3d_units * ~12 + base_gap
const VARIANT_LABEL_OFFSET = [
  // 0: Ringed  — outer ring at radius*2.2
  (r) => Math.round(r * 26 + 6),
  // 1: Crystal — wireframe at radius*1.15
  (r) => Math.round(r * 14 + 6),
  // 2: Nebula  — satellites out to radius*2.8
  (r) => Math.round(r * 34 + 6),
  // 3: Pulsing — outer shell at radius*1.3
  (r) => Math.round(r * 16 + 6),
];

// ─── Universe Variants ─────────────────────────────────────────────────────

// Variant 0: Ringed Planet — sphere + two tilted torus rings, counter-rotating
function VariantRinged({ radius, color, emissive, isHovered }) {
  const sphereRef = useRef();
  const ring1Ref  = useRef();
  const ring2Ref  = useRef();

  useFrame((_, dt) => {
    if (sphereRef.current) sphereRef.current.rotation.y  += 0.007 * dt * 60;
    if (ring1Ref.current)  ring1Ref.current.rotation.z   += 0.004 * dt * 60;
    if (ring2Ref.current)  ring2Ref.current.rotation.z   -= 0.003 * dt * 60;
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      <mesh ref={sphereRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI}
          roughness={0.25} metalness={0.3}
        />
      </mesh>

      {/* Inner ring — closer, more opaque */}
      <group rotation={[Math.PI / 2 + 0.38, 0, 0.28]}>
        <mesh ref={ring1Ref}>
          <torusGeometry args={[radius * 1.72, radius * 0.055, 8, 80]} />
          <meshStandardMaterial
            color={color} emissive={color} emissiveIntensity={eI * 0.65}
            transparent opacity={0.72} roughness={0.45}
          />
        </mesh>
      </group>

      {/* Outer ring — wider, more transparent */}
      <group rotation={[Math.PI / 2 + 0.65, 0.22, 0]}>
        <mesh ref={ring2Ref}>
          <torusGeometry args={[radius * 2.2, radius * 0.03, 6, 80]} />
          <meshStandardMaterial
            color={color} emissive={color} emissiveIntensity={eI * 0.38}
            transparent opacity={0.42} roughness={0.5}
          />
        </mesh>
      </group>
    </group>
  );
}

// Variant 1: Crystalline Geosphere — solid low-poly core + outer wireframe icosahedron
function VariantCrystalline({ radius, color, emissive, isHovered }) {
  const outerRef = useRef();
  const innerRef = useRef();

  useFrame((_, dt) => {
    if (outerRef.current) outerRef.current.rotation.y += 0.006 * dt * 60;
    if (innerRef.current) innerRef.current.rotation.y -= 0.010 * dt * 60;
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      {/* Outer wireframe cage */}
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[radius * 1.15, 1]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 0.55}
          wireframe transparent opacity={0.52}
        />
      </mesh>

      {/* Inner solid faceted core */}
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[radius * 0.78, 0]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI}
          roughness={0.08} metalness={0.82}
        />
      </mesh>
    </group>
  );
}

// Variant 2: Nebula Cluster — core sphere + 3 satellites in tilted circular orbits
function VariantNebula({ radius, color, emissive, isHovered }) {
  const sat0 = useRef();
  const sat1 = useRef();
  const sat2 = useRef();
  const satRefs = [sat0, sat1, sat2];

  // Pre-compute stable orbit basis vectors (no per-frame allocation)
  const specs = useMemo(() => {
    const makeOrbit = (axArr, speed, dist, size, t0) => {
      const axis  = new THREE.Vector3(...axArr).normalize();
      const tmp   = Math.abs(axis.y) < 0.9
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(1, 0, 0);
      const u = tmp.clone().sub(axis.clone().multiplyScalar(tmp.dot(axis))).normalize();
      const v = axis.clone().cross(u).normalize();
      return { u, v, speed, dist, size, t: t0 };
    };
    return [
      makeOrbit([1, 0.4, 0],    0.7,  radius * 2.1, radius * 0.28, 0),
      makeOrbit([0.3, 1, 0.6],  0.45, radius * 2.6, radius * 0.20, 2.1),
      makeOrbit([0.7, 0.1, 1],  0.9,  radius * 1.85,radius * 0.16, 4.2),
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
      <mesh>
        <sphereGeometry args={[radius, 24, 24]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI}
          roughness={0.3} metalness={0.2}
        />
      </mesh>
      {specs.map((s, i) => (
        <mesh key={i} ref={satRefs[i]}>
          <sphereGeometry args={[s.size, 10, 10]} />
          <meshStandardMaterial
            color={color} emissive={color}
            emissiveIntensity={eI * (0.75 - i * 0.08)}
            roughness={0.35}
          />
        </mesh>
      ))}
    </group>
  );
}

// Variant 3: Pulsing Energy Core — solid core + breathing semi-transparent shell
function VariantPulsing({ radius, color, emissive, isHovered }) {
  const shellRef = useRef();
  const coreRef  = useRef();
  const tRef     = useRef(0);

  useFrame((_, dt) => {
    tRef.current += dt;
    if (coreRef.current)  coreRef.current.rotation.y  += 0.012 * dt * 60;
    if (shellRef.current) {
      const s = 1 + Math.sin(tRef.current * 2.1) * 0.07;
      shellRef.current.scale.setScalar(s);
    }
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      {/* Outer breathing shell */}
      <mesh ref={shellRef}>
        <sphereGeometry args={[radius * 1.3, 24, 24]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 0.38}
          transparent opacity={0.17}
          roughness={0} metalness={0}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Inner solid core */}
      <mesh ref={coreRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.35}
          roughness={0.06} metalness={0.5}
        />
      </mesh>
    </group>
  );
}

const UNIVERSE_VARIANTS = [
  VariantRinged,
  VariantCrystalline,
  VariantNebula,
  VariantPulsing,
];

// ─── Animated Edge ─────────────────────────────────────────────────────────

// Single energy particle travelling along an edge
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
      <sphereGeometry args={[0.062, 5, 5]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={3.0}
        transparent
        opacity={opacity}
      />
    </mesh>
  );
}

// Edge with static base line + bidirectional energy particles
function AnimatedEdge({ src, tgt, color, opacity }) {
  const srcV = useMemo(() => new THREE.Vector3(...src), [src]);
  const tgtV = useMemo(() => new THREE.Vector3(...tgt), [tgt]);

  // Four particles: 2 forward, 2 reverse, each with distinct speed & phase
  const particles = useMemo(() => [
    { initialT: 0.08, speed: 0.30, direction:  1 },
    { initialT: 0.58, speed: 0.18, direction:  1 },
    { initialT: 0.32, speed: 0.24, direction: -1 },
    { initialT: 0.78, speed: 0.14, direction: -1 },
  ], []);

  const particleOpacity = Math.min(0.95, opacity * 2.0);

  return (
    <>
      <Line
        points={[src, tgt]}
        color={color}
        lineWidth={0.5}
        transparent
        opacity={opacity * 0.3}
      />
      {particles.map((p, i) => (
        <EdgeParticle
          key={i}
          srcV={srcV}
          tgtV={tgtV}
          color={color}
          opacity={particleOpacity}
          {...p}
        />
      ))}
    </>
  );
}

// ─── Universe Node ─────────────────────────────────────────────────────────
function UniverseNode({ position, universe, radius, interactive, onHover, isHovered }) {
  const color        = STATUS_COLORS[universe.status] || STATUS_COLORS.ACTIVE;
  const emissive     = STATUS_EMISSIVE[universe.status] || 1.0;
  const variantIndex = (universe.displayOrder ?? 0) % 4;
  const Variant      = UNIVERSE_VARIANTS[variantIndex];

  // Label offset: translateX in CSS px (pre-distanceFactor scaling).
  // Since Html always faces the camera, translateX is always screen-right.
  const labelOffsetPx = VARIANT_LABEL_OFFSET[variantIndex](radius);

  return (
    <group position={position}>
      {/* Invisible hit-detection sphere — covers the whole variant's extent */}
      <mesh
        onPointerEnter={() => interactive && onHover(universe)}
        onPointerLeave={() => interactive && onHover(null)}
      >
        <sphereGeometry args={[radius * 3.2, 8, 8]} />
        <meshBasicMaterial transparent opacity={0.001} depthWrite={false} />
      </mesh>

      <Variant radius={radius} color={color} emissive={emissive} isHovered={isHovered} />

      {/* Label — always rendered to the screen-right of the node */}
      <Html distanceFactor={14} zIndexRange={[1, 2]}>
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
      x: (Math.random() - 0.5) * 10,
      y: (Math.random() - 0.5) * 10,
      z: (Math.random() - 0.5) * 10,
    }));

    const links = rawEdges
      .filter(e => idSet.has(e.source) && idSet.has(e.target))
      .map(e => ({ source: e.source, target: e.target, weight: e.weight }));

    const sim = forceSimulation(nodes, 3)
      .force('charge', forceManyBody().strength(CONFIG.forceCharge))
      .force('link',   forceLink(links).id(d => d.id).distance(CONFIG.forceLinkDistance).strength(0.35))
      .force('center', forceCenter())
      .force('collide',forceCollide(2.0))
      .stop();

    for (let i = 0; i < CONFIG.forceSimTicks; i++) sim.tick();

    const positions = {};
    nodes.forEach(n => { positions[n.id] = [n.x ?? 0, n.y ?? 0, n.z ?? 0]; });

    const maxWeight = Math.max(1, ...links.map(l => l.weight));

    return { universes, links, positions, maxWeight };
  }, [networkData]);

  const [hovered, setHovered] = useState(null);

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

      {/* Animated edges */}
      {links.map((link, i) => {
        const src = positions[typeof link.source === 'object' ? link.source.id : link.source];
        const tgt = positions[typeof link.target === 'object' ? link.target.id : link.target];
        if (!src || !tgt) return null;
        const opacity = CONFIG.edgeOpacityMin +
          (link.weight / maxWeight) * (CONFIG.edgeOpacityMax - CONFIG.edgeOpacityMin);
        return (
          <AnimatedEdge key={i} src={src} tgt={tgt} color="#aac4ff" opacity={opacity} />
        );
      })}

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
  const [networkData,      setNetworkData]      = useState(null);
  const [loading,          setLoading]          = useState(true);
  const [error,            setError]            = useState(null);
  const [hoveredUniverse,  setHoveredUniverse]  = useState(null);

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
            maxDistance={32}
            minDistance={6}
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
