import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  edgeOpacityMin:      0.06,
  edgeOpacityMax:      0.32,
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

// ─── 3D Node ───────────────────────────────────────────────────────────────
function UniverseNode({ position, universe, radius, interactive, onHover, isHovered }) {
  const meshRef = useRef();
  const color = STATUS_COLORS[universe.status] || STATUS_COLORS.ACTIVE;
  const emissive = STATUS_EMISSIVE[universe.status] || 1.0;

  useFrame(() => {
    if (meshRef.current) meshRef.current.rotation.y += 0.004;
  });

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onPointerEnter={() => interactive && onHover(universe)}
        onPointerLeave={() => interactive && onHover(null)}
      >
        <sphereGeometry args={[radius, CONFIG.nodeSphereSegments, CONFIG.nodeSphereSegments]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={isHovered ? emissive * 1.8 : emissive}
          roughness={0.3}
          metalness={0.15}
        />
      </mesh>

      <Html position={[radius + 0.55, 0, 0]} distanceFactor={14} zIndexRange={[1, 2]}>
        <div className="universe-node-label" style={{ opacity: isHovered ? 1 : 0.88 }}>
          <div className="label-name" style={{ color }}>{universe.name}</div>
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
      .force('link', forceLink(links).id(d => d.id).distance(CONFIG.forceLinkDistance).strength(0.35))
      .force('center', forceCenter())
      .force('collide', forceCollide(2.0))
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
  const cases = universes.map(u => u.currentCases);
  const maxCases = Math.max(1, ...cases);
  const minCases = Math.min(...cases);
  const caseRange = maxCases - minCases || 1;

  return (
    <>
      <ambientLight intensity={0.08} />
      <pointLight position={[0, 0, 0]} intensity={0.6} color="#aac4ff" decay={2} />

      {/* Edges */}
      {links.map((link, i) => {
        const src = positions[typeof link.source === 'object' ? link.source.id : link.source];
        const tgt = positions[typeof link.target === 'object' ? link.target.id : link.target];
        if (!src || !tgt) return null;
        const opacity = CONFIG.edgeOpacityMin + (link.weight / maxWeight) * (CONFIG.edgeOpacityMax - CONFIG.edgeOpacityMin);
        return (
          <Line
            key={i}
            points={[src, tgt]}
            color="#aac4ff"
            lineWidth={0.6}
            transparent
            opacity={opacity}
          />
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
/**
 * UniverseNetworkVisualization
 *
 * mode:
 *   'display'     – full-viewport standalone screen (exhibit display)
 *   'interactive' – embedded in ResultsScreen, hover tooltips enabled
 *
 * onClose  – if provided, renders an EXIT button calling this handler
 */
function UniverseNetworkVisualization({ mode = 'display', autoRotate = true, onClose }) {
  const [networkData, setNetworkData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [hoveredUniverse, setHoveredUniverse] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
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

    fetch();
    const interval = setInterval(fetch, CONFIG.refreshIntervalMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const interactive = mode === 'interactive';

  return (
    <div className={`universe-network-viz mode-${mode}`}>

      {/* Status overlays */}
      {loading && <div className="network-status">INITIALIZING DIMENSIONAL NETWORK...</div>}
      {error   && <div className="network-status error">{error}</div>}

      {/* 3D Canvas */}
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

      {/* Display mode header */}
      {mode === 'display' && (
        <div className="network-header">
          <div className="network-title">DIMENSIONAL NETWORK</div>
          <div className="network-subtitle">LIVE STATUS · {networkData?.universes?.length ?? '—'} DIMENSIONS</div>
        </div>
      )}

      {/* Hover tooltip (interactive mode) */}
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

      {/* Exit button */}
      {onClose && (
        <button className="network-close-btn" onClick={onClose}>
          [ CLOSE NETWORK ]
        </button>
      )}
    </div>
  );
}

export default UniverseNetworkVisualization;
