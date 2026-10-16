import { BODY, STEP } from './types.ts';
import type { Fish, InitialFish, Player, Position } from './types.ts';
import { FISH_SPECIES } from './fish-species.ts';
import { canOccupy, landAtCenter, SHOP } from './world.ts';
import type { World } from './world.ts';

export const FISH_RADIUS = .2;
export const JUMP_DURATION = .4;

export function fishClearOfShop(p: Position): boolean {
  const x = Math.max(SHOP.x - SHOP.halfWidth, Math.min(p.x, SHOP.x + SHOP.halfWidth));
  const z = Math.max(SHOP.z - SHOP.halfDepth, Math.min(p.z, SHOP.z + SHOP.halfDepth));
  return Math.hypot(p.x - x, p.z - z) >= FISH_RADIUS - 1e-9;
}

/** Swept circle stops even if an entire motion crosses the shop in a single step. */
export function moveFish(p: Position, dx: number, dz: number): { position: Position; blocked: boolean } {
  const distance = Math.hypot(dx, dz); const samples = Math.max(1, Math.ceil(distance / .05));
  let safe = 0;
  for (let i = 1; i <= samples; i++) {
    const fraction = i / samples;
    const candidate = { ...p, x: p.x + dx * fraction, z: p.z + dz * fraction };
    if (fishClearOfShop(candidate)) { safe = fraction; continue; }
    let low = safe; let high = fraction;
    for (let iteration = 0; iteration < 24; iteration++) {
      const mid = (low + high) / 2;
      if (fishClearOfShop({ ...p, x: p.x + dx * mid, z: p.z + dz * mid })) low = mid;
      else high = mid;
    }
    return { position: { ...p, x: p.x + dx * low, z: p.z + dz * low }, blocked: true };
  }
  return { position: { ...p, x: p.x + dx, z: p.z + dz }, blocked: false };
}

export function placementPreview(world: World, player: Player): { position: Position; valid: boolean; reason: string } {
  const distance = 2 * Math.cos(player.pitch);
  const target = { x: player.position.x + Math.sin(player.yaw) * distance, y: world.surface,
    z: player.position.z + Math.cos(player.yaw) * distance };
  const fail = (reason: string) => ({ position: target, valid: false, reason });
  if (player.position.y !== world.surface || player.pitch > 0) return fail('no-ground');
  if (!landAtCenter(world, target)) return fail('water');
  if (distance < BODY.radius + FISH_RADIUS) return fail('body-overlap');
  if (!canOccupy(world, target) || moveFish({ ...player.position }, target.x - player.position.x, target.z - player.position.z).blocked)
    return fail('obstructed');
  return { position: target, valid: true, reason: 'place-fish' };
}

export function nearestCoastDirection(world: World, p: Position): { x: number; z: number } {
  if (world.coast.kind === 'circle') {
    const length = Math.hypot(p.x, p.z);
    return length < 1e-9 ? { x: 0, z: 1 } : { x: p.x / length, z: p.z / length };
  }
  const size = world.coast.halfSize;
  const candidates = [
    { distance: size - p.z, x: 0, z: 1 }, { distance: size - p.x, x: 1, z: 0 },
    { distance: size + p.z, x: 0, z: -1 }, { distance: size + p.x, x: -1, z: 0 },
  ];
  let closest = candidates[0];
  for (const candidate of candidates) if (candidate.distance < closest.distance - 1e-9) closest = candidate;
  return { x: closest.x, z: closest.z };
}

export function createLiveFish(initial: InitialFish): Fish {
  const warning = initial.state === 'groundedAlive' && initial.jumpTimer >= FISH_SPECIES[initial.species].jumpInterval - .2 - 1e-9;
  return { ...initial, hp: initial.hp ?? (initial.state === 'groundedDead' ? 0 : FISH_SPECIES[initial.species].hp), position: { ...initial.position }, jumpPhase: warning ? 'warning' : 'idle',
    jumpElapsed: 0, jumpDirection: { x: 0, z: 1 }, jumpBlocked: false };
}

/** One real 1/60s step. Timer counts from takeoff and includes time in the air. */
export function stepLiveFish(world: World, fish: Fish): boolean {
  if (fish.state !== 'groundedAlive') return false;
  if (!landAtCenter(world, fish.position)) return true;
  const definition = FISH_SPECIES[fish.species];
  fish.jumpTimer += STEP;
  if (fish.jumpPhase === 'jumping') {
    fish.jumpElapsed = Math.min(JUMP_DURATION, fish.jumpElapsed + STEP);
    if (!fish.jumpBlocked) {
      const distance = definition.jumpDistance / 24;
      const moved = moveFish(fish.position, fish.jumpDirection.x * distance, fish.jumpDirection.z * distance);
      fish.position = moved.position; fish.jumpBlocked = moved.blocked;
    }
    const fraction = fish.jumpElapsed / JUMP_DURATION;
    fish.position.y = world.surface + 1.6 * fraction * (1 - fraction);
    if (!landAtCenter(world, fish.position)) return true;
    if (fish.jumpElapsed >= JUMP_DURATION - 1e-9) {
      fish.position.y = world.surface; fish.jumpElapsed = JUMP_DURATION; fish.jumpPhase = 'idle';
    }
  } else if (fish.jumpTimer >= definition.jumpInterval - 1e-9) {
    fish.jumpTimer = 0; fish.jumpElapsed = 0; fish.jumpBlocked = false;
    fish.jumpDirection = nearestCoastDirection(world, fish.position); fish.jumpPhase = 'jumping';
  } else {
    fish.jumpPhase = fish.jumpTimer >= definition.jumpInterval - .2 - 1e-9 ? 'warning' : 'idle';
  }
  return false;
}
