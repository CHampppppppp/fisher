import { BODY } from './types.ts';
import type { Position } from './types.ts';

export interface World {
  fixture: 'island' | 'shore' | 'fish-arena' | 'boss-arena';
  surface: number;
  coast: { kind: 'square'; halfSize: number } | { kind: 'circle'; radius: number };
}
export const SHOP = { x: -6, z: 0, halfWidth: 1.5, halfDepth: 1.5, bottom: 1, height: 3.8 } as const;
export const makeWorld = (fixture: World['fixture']): World => ({
  fixture, surface: 1,
  coast: fixture !== 'island' ? { kind: 'square', halfSize: 10 } : { kind: 'circle', radius: 23 },
});

/** Water/escape uses the center, whereas standing checks the full player radius. */
export function landAtCenter(world: World, p: Position): boolean {
  return world.coast.kind === 'square'
    ? Math.abs(p.x) <= world.coast.halfSize && Math.abs(p.z) <= world.coast.halfSize
    : Math.hypot(p.x, p.z) <= world.coast.radius;
}

export function insideLand(world: World, p: Position): boolean {
  const coast = world.coast;
  if (coast.kind === 'square') {
    return Math.abs(p.x) <= coast.halfSize - BODY.radius && Math.abs(p.z) <= coast.halfSize - BODY.radius;
  }
  return Math.hypot(p.x, p.z) <= coast.radius - BODY.radius;
}

export function intersectsShop(p: Position): boolean {
  if (p.y >= SHOP.bottom + SHOP.height || p.y + BODY.height <= SHOP.bottom) return false;
  const x = Math.max(SHOP.x - SHOP.halfWidth, Math.min(p.x, SHOP.x + SHOP.halfWidth));
  const z = Math.max(SHOP.z - SHOP.halfDepth, Math.min(p.z, SHOP.z + SHOP.halfDepth));
  return Math.hypot(p.x - x, p.z - z) < BODY.radius;
}

export function canOccupy(world: World, p: Position): boolean {
  return insideLand(world, p) && !intersectsShop(p);
}

// Each 60 Hz move is at most 0.1 m; solve axes separately for wall sliding.
export function moveHorizontal(world: World, p: Position, dx: number, dz: number): Position {
  const next = { ...p };
  for (const [axis, delta] of [['x', dx], ['z', dz]] as const) {
    if (!delta) continue;
    const candidate = { ...next, [axis]: next[axis] + delta };
    if (canOccupy(world, candidate)) { next[axis] = candidate[axis]; continue; }
    let low = 0; let high = 1;
    for (let i = 0; i < 24; i++) {
      const fraction = (low + high) / 2;
      if (canOccupy(world, { ...next, [axis]: next[axis] + delta * fraction })) low = fraction;
      else high = fraction;
    }
    next[axis] += delta * low;
  }
  return next;
}
