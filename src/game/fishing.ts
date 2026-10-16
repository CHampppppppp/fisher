import { BODY } from './types.ts';
import type { CastPreview, FishingCast, Player, Position, FishingState } from './types.ts';
import { SHOP } from './world.ts';
import type { World } from './world.ts';

export const FISHING_LOOK = { yaw: 20 * Math.PI / 180, pitch: 10 * Math.PI / 180 } as const;
export const castingDistance = (seconds: number): number => 3 + 15 * Math.min(1, Math.max(0, seconds));

export function idleFishing(preview: CastPreview): FishingState {
  return {
    phase: 'idle', chargeSeconds: 0, cast: null, preview,
    progress: 0, tension: 0, species: null, biteRemaining: 0,
    highTensionDuration: 0, lowTensionDuration: 0, reelElapsed: 0,
    struggling: false, holding: false, result: null,
  };
}

export function carriedPosition(player: Player): Position {
  const sin = Math.sin(player.yaw); const cos = Math.cos(player.yaw);
  const sp = Math.sin(player.pitch); const cp = Math.cos(player.pitch);
  return {
    x: player.position.x + cos * 0.28 + sin * sp * 0.25 + sin * cp * 0.85,
    y: player.position.y + BODY.height * 0.9 - cp * 0.25 + sp * 0.85,
    z: player.position.z - sin * 0.28 + cos * sp * 0.25 + cos * cp * 0.85,
  };
}

function waterAt(world: World, p: Position): boolean {
  const coast = world.coast;
  return coast.kind === 'square'
    ? Math.abs(p.x) > coast.halfSize || Math.abs(p.z) > coast.halfSize
    : Math.hypot(p.x, p.z) > coast.radius;
}

/** Production line-of-sight against the same solid shop used for body collision. */
export function shopBlocks(origin: Position, target: Position): boolean {
  let entry = 0; let exit = 1;
  for (const [axis, low, high] of [
    ['x', SHOP.x - SHOP.halfWidth, SHOP.x + SHOP.halfWidth],
    ['y', SHOP.bottom, SHOP.bottom + SHOP.height],
    ['z', SHOP.z - SHOP.halfDepth, SHOP.z + SHOP.halfDepth],
  ] as const) {
    const delta = target[axis] - origin[axis];
    if (Math.abs(delta) < 1e-10) {
      if (origin[axis] < low || origin[axis] > high) return false;
      continue;
    }
    const a = (low - origin[axis]) / delta; const b = (high - origin[axis]) / delta;
    entry = Math.max(entry, Math.min(a, b)); exit = Math.min(exit, Math.max(a, b));
    if (entry > exit) return false;
  }
  return entry <= exit && exit >= 0 && entry <= 1;
}

/** Find where the cast line exits sand; it must clear the Y=1 shoreline lip. */
function clearsCoast(world: World, origin: Position, target: Position): boolean {
  const dx = target.x - origin.x; const dz = target.z - origin.z;
  let fraction = 1;
  if (world.coast.kind === 'square') {
    const half = world.coast.halfSize;
    for (const [value, delta] of [[origin.x, dx], [origin.z, dz]]) {
      if (Math.abs(delta) > 1e-10) {
        const t = ((delta > 0 ? half : -half) - value) / delta;
        if (t >= 0) fraction = Math.min(fraction, t);
      }
    }
  } else {
    const a = dx * dx + dz * dz;
    const b = 2 * (origin.x * dx + origin.z * dz);
    const c = origin.x * origin.x + origin.z * origin.z - world.coast.radius ** 2;
    fraction = (-b + Math.sqrt(Math.max(0, b * b - 4 * a * c))) / (2 * a);
  }
  return origin.y + (target.y - origin.y) * fraction > world.surface + 1e-6;
}

export function castPreview(world: World, player: Player, seconds: number): CastPreview {
  const distance = castingDistance(seconds);
  const position = {
    x: player.position.x + Math.sin(player.yaw) * distance,
    y: 0,
    z: player.position.z + Math.cos(player.yaw) * distance,
  };
  const origin = { ...player.position, y: player.position.y + BODY.height * 0.9 };
  const reason = !waterAt(world, position) ? 'land'
    : shopBlocks(origin, position) || !clearsCoast(world, origin, position) ? 'obstructed' : 'water';
  return { position, distance, valid: reason === 'water', reason };
}

export function floatPitch(player: Player, distance: number): number {
  return Math.atan2(0.12 - (player.position.y + BODY.height * 0.9), distance);
}

export function limitedLook(cast: FishingCast, yaw: number, pitch: number): { yaw: number; pitch: number } {
  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const delta = wrap(wrap(yaw) - wrap(cast.yaw));
  return {
    yaw: cast.yaw + Math.max(-FISHING_LOOK.yaw, Math.min(FISHING_LOOK.yaw, delta)),
    pitch: Math.max(-1.4, Math.min(1.4,
      Math.max(cast.pitch - FISHING_LOOK.pitch, Math.min(cast.pitch + FISHING_LOOK.pitch, pitch)))),
  };
}
