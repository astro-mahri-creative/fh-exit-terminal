import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  STATUS_COLORS,
  STATUS_EMISSIVE,
  UNIVERSE_VARIANTS,
  hashId,
  seededRand,
} from './universeVariants';

// Sculpture scale in world units. The widest variant (Asteroid) extends to
// ~2.5× radius; at 0.32 that is ±0.8 around the sculpture's grid position,
// which clears the cell's right-half sub-region with margin.
export const SCULPTURE_RADIUS = 0.32;

function AutoRotate({ children, speedX, speedY }) {
  const ref = useRef();
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += speedY * dt;
    ref.current.rotation.x += speedX * dt;
  });
  return <group ref={ref}>{children}</group>;
}

// One universe's 3D sculpture, positioned at a fixed grid coordinate inside
// the TV Wall's single shared canvas. Renders nothing when no universe is
// assigned to this slot.
export default function TVWallSculpture({ universe, variantIndex, position }) {
  // Per-universe rotation speeds — seeded from the universe id (or slot index
  // when no universe is mounted) so each cell is stable across reloads but
  // visually distinct from its neighbours. Y is the dominant spin; X is
  // slower. We mix the hash with a Knuth-style constant and discard a few
  // warm-up values because the LCG's first outputs correlate across similar
  // input seeds. Computed before the null check so hook order stays stable.
  const rotation = useMemo(() => {
    const seed = universe?._id?.toString() ?? `slot-${variantIndex ?? 0}`;
    const mixed = (hashId(seed) * 2654435761) >>> 0;
    const rand = seededRand(mixed);
    rand(); rand(); rand(); // decorrelate
    const dirY = rand() < 0.5 ? -1 : 1;
    const dirX = rand() < 0.5 ? -1 : 1;
    return {
      speedY: dirY * (0.22 + rand() * 0.45),   // |0.22..0.67| rad/s
      speedX: dirX * (0.05 + rand() * 0.28),   // |0.05..0.33| rad/s
    };
  }, [universe?._id, variantIndex]);

  if (!universe) return null;

  const color    = STATUS_COLORS[universe.status] || STATUS_COLORS.COMPROMISED;
  const emissive = STATUS_EMISSIVE[universe.status] || 1.0;
  const seed     = universe._id.toString();
  // Prefer the supplied variantIndex (collision-free across 9 cells).
  // Fall back to the id hash for safety if the prop is missing.
  const idxSource = Number.isInteger(variantIndex) ? variantIndex : hashId(seed);
  const safeIndex = ((idxSource % UNIVERSE_VARIANTS.length) + UNIVERSE_VARIANTS.length) % UNIVERSE_VARIANTS.length;
  const Variant   = UNIVERSE_VARIANTS[safeIndex];

  return (
    <group position={position}>
      <AutoRotate speedX={rotation.speedX} speedY={rotation.speedY}>
        <Variant
          radius={SCULPTURE_RADIUS}
          color={color}
          emissive={emissive}
          isHovered={false}
          seed={seed}
        />
      </AutoRotate>
    </group>
  );
}
