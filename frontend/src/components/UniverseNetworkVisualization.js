import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html, Line } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force-3d';
import { networkService } from '../services/api';
import useSteppedCountUp from '../hooks/useSteppedCountUp';
import './UniverseNetworkVisualization.css';

const STEPPED_COUNT_STEPS = 5;
const STEPPED_COUNT_DURATION_MS = 670; // (steps + 1) * duration ≈ 4s total

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
  TRANSCENDED:  '#9575cd',
  PRESERVED:    '#4a90d9',
  COMPROMISED:  '#7ec88b',
  LIBERATED:    '#d4a032',
  QUARANTINED:  '#c94040',
};

const STATUS_EMISSIVE = {
  TRANSCENDED:  3.0,
  PRESERVED:    1.8,
  COMPROMISED:  2.2,
  LIBERATED:    1.6,
  QUARANTINED:  2.4,
};

// ─── Deterministic per-universe random helpers ─────────────────────────────
// Stable hash from MongoDB ObjectId string → integer
function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// Seeded LCG pseudo-random number generator — returns a function that
// produces a new value in [0, 1) on each call, deterministic from seed.
function seededRand(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// Label offset in CSS px (pre Html distanceFactor scaling).
// translateX is always screen-right because Html faces the camera.
// Each variant clears its own outer extent generously.
const VARIANT_LABEL_OFFSET = [
  // 0: Nebula      — satellites reach radius * 2.8
  (r) => Math.round(r * 70 + 40),
  // 1: Pulsing     — shells reach up to radius * 1.75
  (r) => Math.round(r * 65 + 35),
  // 2: Ringed      — torus outer ≈ radius * 2.15
  (r) => Math.round(r * 72 + 35),
  // 3: Crystalline — single faceted core ≈ radius * 1.0
  (r) => Math.round(r * 50 + 28),
  // 4: Wireframe   — outer wireframe sphere ≈ radius * 1.4
  (r) => Math.round(r * 54 + 30),
  // 5: Spiked      — spike length ≈ radius * 1.7
  (r) => Math.round(r * 72 + 35),
  // 6: Vortex      — helix radius ≈ radius * 1.5
  (r) => Math.round(r * 60 + 32),
  // 7: Binary      — twin cores swing to ≈ radius * 1.7
  (r) => Math.round(r * 68 + 38),
  // 8: Asteroid    — fragment belt outer ≈ radius * 2.5
  (r) => Math.round(r * 78 + 42),
  // 9: Cubic       — wireframe cage ≈ radius * 1.4
  (r) => Math.round(r * 58 + 32),
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
      makeOrbit([1,   0.4, 0  ], 0.163, radius * 2.2, radius * 0.34, 0),
      makeOrbit([0.3, 1,   0.6], 0.105, radius * 2.8, radius * 0.26, 2.1),
      makeOrbit([0.7, 0.1, 1  ], 0.213, radius * 1.95,radius * 0.20, 4.2),
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
// Rotating solid core + 3–5 independently breathing shells.
// Shell count and sizes are seeded from the universe ID for stable variation.
function VariantPulsing({ radius, color, emissive, isHovered, seed }) {
  const coreRef     = useRef();
  const shellMeshes = useRef([]); // populated via callback refs — avoids variable hook count
  const tRef        = useRef(0);

  // Generate stable shell configs from universe ID seed
  const shells = useMemo(() => {
    const rand  = seededRand(hashId(seed || '0'));
    const count = 3 + Math.floor(rand() * 3);           // 3, 4, or 5 shells
    const maxR  = 1.50 + rand() * 0.25;                 // outermost shell: 1.50× – 1.75×
    const minR  = 1.12;                                 // innermost shell always at 1.12×
    return Array.from({ length: count }, (_, i) => {
      const t = count === 1 ? 0 : i / (count - 1);
      return {
        sizeMult:     minR + t * (maxR - minR),         // evenly distributed radii
        pulseSpeed:   1.0  + rand() * 1.3,              // each shell breathes at its own rate
        pulseAmp:     0.05 + rand() * 0.08,             // subtle to moderate pulse depth
        phaseOffset:  rand() * Math.PI * 2,             // de-sync phases
        emissiveMult: Math.max(0.10, 0.34 - i * 0.06), // inner shells slightly brighter
        opacity:      Math.max(0.04, 0.17 - i * 0.03), // inner shells slightly more opaque
      };
    });
  }, [seed]);

  useFrame((_, dt) => {
    tRef.current += dt;
    const t = tRef.current;
    if (coreRef.current) coreRef.current.rotation.y += 0.010 * dt * 60;
    shells.forEach((s, i) => {
      const mesh = shellMeshes.current[i];
      if (mesh) {
        const sc = 1 + Math.sin(t * s.pulseSpeed + s.phaseOffset) * s.pulseAmp;
        mesh.scale.setScalar(sc);
      }
    });
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      {/* Breathing shells — outermost to innermost so core renders on top */}
      {[...shells].reverse().map((s, ri) => {
        const i = shells.length - 1 - ri;
        return (
          <mesh key={i} ref={el => { shellMeshes.current[i] = el; }}>
            <sphereGeometry args={[radius * s.sizeMult, 20, 20]} />
            <meshStandardMaterial
              color={color} emissive={color}
              emissiveIntensity={eI * s.emissiveMult}
              transparent opacity={s.opacity}
              roughness={0} side={THREE.BackSide}
            />
          </mesh>
        );
      })}

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

// ─── Variant 2: Ringed Giant ───────────────────────────────────────────────
// Matte planetary core + tilted torus ring system rotating around it.
// Tilt is seeded per universe so two Ringed worlds don't share an axis.
function VariantRinged({ radius, color, emissive, isHovered, seed }) {
  const ringPrimary   = useRef();
  const ringSecondary = useRef();
  const coreRef       = useRef();

  const tilt = useMemo(() => {
    const rand = seededRand(hashId(seed || '0'));
    return [0.35 + rand() * 0.35, 0, 0.10 + rand() * 0.40];
  }, [seed]);

  useFrame((_, dt) => {
    if (ringPrimary.current)   ringPrimary.current.rotation.z   += 0.18 * dt;
    if (ringSecondary.current) ringSecondary.current.rotation.z -= 0.12 * dt;
    if (coreRef.current)       coreRef.current.rotation.y       += 0.06 * dt;
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      <group rotation={tilt}>
        <mesh ref={ringPrimary}>
          <torusGeometry args={[radius * 1.85, radius * 0.06, 12, 96]} />
          <meshStandardMaterial
            color={color} emissive={color} emissiveIntensity={eI * 0.75}
            roughness={0.45} metalness={0.55}
            transparent opacity={0.85}
          />
        </mesh>
        <mesh ref={ringSecondary}>
          <torusGeometry args={[radius * 2.15, radius * 0.025, 8, 96]} />
          <meshStandardMaterial
            color={color} emissive={color} emissiveIntensity={eI * 0.45}
            roughness={0.40} metalness={0.55}
            transparent opacity={0.55}
          />
        </mesh>
      </group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[radius, 32, 32]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 0.95}
          roughness={0.55} metalness={0.10}
        />
      </mesh>
    </group>
  );
}

// ─── Variant 3: Crystalline Shard ──────────────────────────────────────────
// Faceted icosahedron tumbling on multiple axes; flatShading makes facets crisp.
// Inner glow shard counter-tumbles inside a translucent outer shell.
function VariantCrystalline({ radius, color, emissive, isHovered }) {
  const outerRef = useRef();
  const innerRef = useRef();

  useFrame((_, dt) => {
    const o = outerRef.current;
    if (o) {
      o.rotation.x += 0.18 * dt;
      o.rotation.y += 0.27 * dt;
      o.rotation.z += 0.09 * dt;
    }
    const i = innerRef.current;
    if (i) {
      i.rotation.x -= 0.32 * dt;
      i.rotation.z -= 0.15 * dt;
    }
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[radius * 0.55, 0]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.6}
          roughness={0.0} metalness={0.85} flatShading
        />
      </mesh>
      <mesh ref={outerRef}>
        <icosahedronGeometry args={[radius, 0]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 0.70}
          roughness={0.10} metalness={0.65} flatShading
          transparent opacity={0.78}
        />
      </mesh>
    </group>
  );
}

// ─── Variant 4: Wireframe Matrix ───────────────────────────────────────────
// Hollow nested wireframe geometry — a digital lattice. The tiny solid heart
// gives the silhouette a real anchor when seen from far out.
function VariantWireframe({ radius, color, emissive, isHovered }) {
  const outerRef = useRef();
  const innerRef = useRef();
  const heartRef = useRef();

  useFrame((_, dt) => {
    if (outerRef.current) {
      outerRef.current.rotation.x += 0.07 * dt;
      outerRef.current.rotation.y += 0.05 * dt;
    }
    if (innerRef.current) {
      innerRef.current.rotation.x -= 0.16 * dt;
      innerRef.current.rotation.z -= 0.12 * dt;
    }
    if (heartRef.current) heartRef.current.rotation.y += 0.30 * dt;
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      <mesh ref={outerRef}>
        <sphereGeometry args={[radius * 1.40, 18, 12]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.2}
          wireframe transparent opacity={0.85}
        />
      </mesh>
      <mesh ref={innerRef}>
        <icosahedronGeometry args={[radius * 0.95, 1]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.4}
          wireframe transparent opacity={0.95}
        />
      </mesh>
      <mesh ref={heartRef}>
        <sphereGeometry args={[radius * 0.32, 16, 16]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.5}
          roughness={0.20} metalness={0.50}
        />
      </mesh>
    </group>
  );
}

// ─── Variant 5: Spiked Beacon ──────────────────────────────────────────────
// Sphere with cone spikes radiating from its surface. Spike count, lengths
// and directions are seeded per universe for stable variation.
function VariantSpiked({ radius, color, emissive, isHovered, seed }) {
  const groupRef = useRef();

  const spikes = useMemo(() => {
    const rand  = seededRand(hashId(seed || '0'));
    const count = 9 + Math.floor(rand() * 4); // 9–12 spikes
    return Array.from({ length: count }, () => {
      // Roughly uniform spherical distribution.
      const u     = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const phi   = Math.acos(u);
      const dir = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.sin(theta),
      );
      const length    = radius * (0.55 + rand() * 0.20);
      const thickness = radius * (0.10 + rand() * 0.06);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      const e = new THREE.Euler().setFromQuaternion(q);
      const pos = dir.clone().multiplyScalar(radius * 0.95 + length * 0.5);
      return { pos: [pos.x, pos.y, pos.z], rot: [e.x, e.y, e.z], length, thickness };
    });
  }, [seed, radius]);

  useFrame((_, dt) => {
    const g = groupRef.current;
    if (g) {
      g.rotation.y += 0.12 * dt;
      g.rotation.x += 0.04 * dt;
    }
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[radius * 0.95, 24, 24]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI}
          roughness={0.40} metalness={0.30}
        />
      </mesh>
      {spikes.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={s.rot}>
          <coneGeometry args={[s.thickness, s.length, 8]} />
          <meshStandardMaterial
            color={color} emissive={color} emissiveIntensity={eI * 1.10}
            roughness={0.30} metalness={0.45}
          />
        </mesh>
      ))}
    </group>
  );
}

// ─── Variant 6: Vortex Helix ───────────────────────────────────────────────
// Solid spinning core + double-helix of small beads drifting around it.
// Drift makes the helix feel like it's flowing along the universe's axis.
function VariantVortex({ radius, color, emissive, isHovered, seed }) {
  const coreRef  = useRef();
  const helixRef = useRef();
  const beadRefs = useRef([]);
  const tRef     = useRef(0);

  const config = useMemo(() => {
    const rand = seededRand(hashId(seed || '0'));
    return {
      beadsPerStrand: 11,
      strands:        2,
      turns:          1.5 + rand() * 0.8,
      strandRadius:   radius * (1.10 + rand() * 0.20),
      beadSize:       radius * 0.12,
      verticalSpan:   radius * 2.8,
    };
  }, [seed, radius]);

  const totalBeads = config.beadsPerStrand * config.strands;

  useFrame((_, dt) => {
    tRef.current += dt;
    if (coreRef.current)  coreRef.current.rotation.y  += 0.30 * dt;
    if (helixRef.current) helixRef.current.rotation.y += 0.20 * dt;
    const drift = (tRef.current * 0.40) % 1;
    for (let i = 0; i < totalBeads; i++) {
      const m = beadRefs.current[i];
      if (!m) continue;
      const strandIdx = Math.floor(i / config.beadsPerStrand);
      const beadIdx   = i % config.beadsPerStrand;
      const t = ((beadIdx + drift * config.beadsPerStrand) % config.beadsPerStrand) / config.beadsPerStrand;
      const angle = t * Math.PI * 2 * config.turns + (strandIdx * Math.PI);
      const y     = (t - 0.5) * config.verticalSpan;
      m.position.set(
        Math.cos(angle) * config.strandRadius,
        y,
        Math.sin(angle) * config.strandRadius,
      );
    }
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[radius * 0.85, 32, 32]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.10}
          roughness={0.20} metalness={0.50}
        />
      </mesh>
      <group ref={helixRef}>
        {Array.from({ length: totalBeads }, (_, i) => (
          <mesh key={i} ref={el => { beadRefs.current[i] = el; }}>
            <sphereGeometry args={[config.beadSize, 10, 10]} />
            <meshStandardMaterial
              color={color} emissive={color} emissiveIntensity={eI * 0.95}
              roughness={0.30} metalness={0.40}
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Variant 7: Binary Pair ────────────────────────────────────────────────
// Two equal cores orbiting an empty barycenter. A faint glow at the centre
// helps the pair read as a single universe under the same label.
function VariantBinary({ radius, color, emissive, isHovered, seed }) {
  const aRef = useRef();
  const bRef = useRef();
  const tRef = useRef(0);

  const config = useMemo(() => {
    const rand = seededRand(hashId(seed || '0'));
    const axisTheta = rand() * Math.PI * 2;
    const axisPhi   = (rand() - 0.5) * 1.4;
    const axis = new THREE.Vector3(
      Math.sin(axisPhi) * Math.cos(axisTheta),
      Math.cos(axisPhi),
      Math.sin(axisPhi) * Math.sin(axisTheta),
    ).normalize();
    const tmp = Math.abs(axis.y) < 0.9
      ? new THREE.Vector3(0, 1, 0)
      : new THREE.Vector3(1, 0, 0);
    const u = tmp.clone().sub(axis.clone().multiplyScalar(tmp.dot(axis))).normalize();
    const v = axis.clone().cross(u).normalize();
    return {
      u, v,
      orbitRadius: radius * 1.05,
      bodyRadius:  radius * 0.65,
      speed:       0.55 + rand() * 0.20,
    };
  }, [seed, radius]);

  useFrame((_, dt) => {
    tRef.current += dt * config.speed;
    const t = tRef.current;
    const c = Math.cos(t), s = Math.sin(t);
    const ax = (config.u.x * c + config.v.x * s) * config.orbitRadius;
    const ay = (config.u.y * c + config.v.y * s) * config.orbitRadius;
    const az = (config.u.z * c + config.v.z * s) * config.orbitRadius;
    if (aRef.current) aRef.current.position.set( ax,  ay,  az);
    if (bRef.current) bRef.current.position.set(-ax, -ay, -az);
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      <mesh ref={aRef}>
        <sphereGeometry args={[config.bodyRadius, 24, 24]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.10}
          roughness={0.18} metalness={0.45}
        />
      </mesh>
      <mesh ref={bRef}>
        <sphereGeometry args={[config.bodyRadius, 24, 24]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.10}
          roughness={0.18} metalness={0.45}
        />
      </mesh>
      <mesh>
        <sphereGeometry args={[radius * 0.22, 16, 16]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 0.80}
          transparent opacity={0.35} roughness={1}
        />
      </mesh>
    </group>
  );
}

// ─── Variant 8: Asteroid Belt ──────────────────────────────────────────────
// Small core + irregular fragments scattered in an equatorial band.
// Each fragment tumbles in place; the whole belt rotates around the core.
function VariantAsteroid({ radius, color, emissive, isHovered, seed }) {
  const beltRef  = useRef();
  const coreRef  = useRef();
  const fragRefs = useRef([]);

  const fragments = useMemo(() => {
    const rand  = seededRand(hashId(seed || '0'));
    const count = 18 + Math.floor(rand() * 8); // 18–25 fragments
    return Array.from({ length: count }, () => {
      const angle = rand() * Math.PI * 2;
      const dist  = radius * (1.55 + rand() * 0.95);
      const yJit  = (rand() - 0.5) * radius * 0.30;
      const size  = radius * (0.07 + rand() * 0.10);
      const spinAxis  = [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1];
      const spinSpeed = 0.30 + rand() * 0.50;
      return { angle, dist, yJit, size, spinAxis, spinSpeed };
    });
  }, [seed, radius]);

  useFrame((_, dt) => {
    if (beltRef.current) beltRef.current.rotation.y += 0.10 * dt;
    if (coreRef.current) coreRef.current.rotation.y -= 0.15 * dt;
    fragments.forEach((f, i) => {
      const m = fragRefs.current[i];
      if (!m) return;
      m.rotation.x += f.spinAxis[0] * f.spinSpeed * dt;
      m.rotation.y += f.spinAxis[1] * f.spinSpeed * dt;
      m.rotation.z += f.spinAxis[2] * f.spinSpeed * dt;
    });
  });

  const eI = isHovered ? emissive * 1.8 : emissive;

  return (
    <group>
      <mesh ref={coreRef}>
        <sphereGeometry args={[radius * 0.82, 24, 24]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI}
          roughness={0.25} metalness={0.40}
        />
      </mesh>
      <group ref={beltRef}>
        {fragments.map((f, i) => (
          <mesh
            key={i}
            ref={el => { fragRefs.current[i] = el; }}
            position={[Math.cos(f.angle) * f.dist, f.yJit, Math.sin(f.angle) * f.dist]}
          >
            <tetrahedronGeometry args={[f.size, 0]} />
            <meshStandardMaterial
              color={color} emissive={color} emissiveIntensity={eI * 0.55}
              roughness={0.65} metalness={0.10} flatShading
            />
          </mesh>
        ))}
      </group>
    </group>
  );
}

// ─── Variant 9: Cubic Cage ─────────────────────────────────────────────────
// Spinning chrome cube wrapped by a counter-rotating wireframe octahedron.
function VariantCubic({ radius, color, emissive, isHovered }) {
  const cubeRef = useRef();
  const cageRef = useRef();

  useFrame((_, dt) => {
    if (cubeRef.current) {
      cubeRef.current.rotation.x += 0.18 * dt;
      cubeRef.current.rotation.y += 0.13 * dt;
    }
    if (cageRef.current) {
      cageRef.current.rotation.x -= 0.10 * dt;
      cageRef.current.rotation.z -= 0.14 * dt;
    }
  });

  const eI = isHovered ? emissive * 1.8 : emissive;
  const side = radius * 1.15;

  return (
    <group>
      <mesh ref={cubeRef}>
        <boxGeometry args={[side, side, side]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI}
          roughness={0.05} metalness={0.70}
        />
      </mesh>
      <mesh ref={cageRef}>
        <octahedronGeometry args={[radius * 1.40, 0]} />
        <meshStandardMaterial
          color={color} emissive={color} emissiveIntensity={eI * 1.20}
          wireframe transparent opacity={0.80}
        />
      </mesh>
    </group>
  );
}

const UNIVERSE_VARIANTS = [
  VariantNebula,      // 0
  VariantPulsing,     // 1
  VariantRinged,      // 2
  VariantCrystalline, // 3
  VariantWireframe,   // 4
  VariantSpiked,      // 5
  VariantVortex,      // 6
  VariantBinary,      // 7
  VariantAsteroid,    // 8
  VariantCubic,       // 9
];

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
            enableZoom={interactive}
            enablePan={false}
            maxDistance={Math.max(38, (cameraZ ?? CONFIG.cameraDistance) + 4)}
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
