import { BODY } from './types.ts';
import type { Fish, Player, Position } from './types.ts';
import type { World } from './world.ts';
import { FISH_RADIUS, moveFish } from './fish-life.ts';
import { shopBlocks } from './fishing.ts';
import { WEAPONS } from './weapons.ts';
import type { WeaponDefinition } from './weapons.ts';

export const PUNCH = WEAPONS.fist;

function visiblePart(player: Player, center: Position, radius: number): boolean {
  const eye = { ...player.position, y: player.position.y + BODY.height * .9 };
  const points = [center, { ...center, y: center.y + radius },
    { ...center, x: center.x + radius }, { ...center, x: center.x - radius },
    { ...center, z: center.z + radius }, { ...center, z: center.z - radius }];
  return points.some(point => !shopBlocks(eye, point));
}

export function targetDistance(player: Player, target: Position, radius: number, range: number, heightLimit=1.5): number | null {
  const dx=target.x-player.position.x;const dz=target.z-player.position.z;const dy=target.y-player.position.y-BODY.height/2;
  const horizontal=Math.hypot(dx,dz);if(Math.abs(dy)>heightLimit+1e-9) return null;
  if(horizontal>1e-9 && (dx*Math.sin(player.yaw)+dz*Math.cos(player.yaw))/horizontal<Math.SQRT1_2-1e-9) return null;
  const distance=Math.max(0,Math.hypot(dx,dy,dz)-radius);
  return distance<=range+1e-9 && visiblePart(player,target,radius)?distance:null;
}

/** Same physical fish sphere for reach and height; fishing mode never calls this. */
export function attackTarget(player: Player, fish: Fish[], weapon: WeaponDefinition): Fish | null {
  let nearest: Fish | null = null; let nearestDistance = Infinity;
  for (const candidate of fish) {
    if (candidate.state !== 'groundedAlive') continue;
    const target = { ...candidate.position, y: candidate.position.y + FISH_RADIUS };
    const distance = targetDistance(player,target,FISH_RADIUS,weapon.range);
    if (distance===null || distance>=nearestDistance) continue;
    nearest = candidate; nearestDistance = distance;
  }
  return nearest;
}

/** A corpse remains inside its entire shoreline radius, including lethal sea knockback. */
export function corpsePosition(world: World, position: Position): Position {
  const result = { ...position, y: world.surface };
  if (world.coast.kind === 'square') {
    const edge = world.coast.halfSize - FISH_RADIUS;
    result.x = Math.max(-edge, Math.min(edge, result.x)); result.z = Math.max(-edge, Math.min(edge, result.z));
  } else {
    const edge = world.coast.radius - FISH_RADIUS; const length = Math.hypot(result.x, result.z);
    if (length > edge) { result.x *= edge / length; result.z *= edge / length; }
  }
  return result;
}

export function attackFish(world: World, fish: Fish, player: Player, weapon: WeaponDefinition): boolean {
  fish.hp = Math.max(0, fish.hp - weapon.damage);
  const died = fish.hp === 0;
  if (died) {
    fish.state = 'groundedDead'; fish.jumpPhase = 'idle'; fish.jumpTimer = 0; fish.jumpElapsed = 0;
    fish.jumpBlocked = false; fish.position.y = world.surface;
  }
  fish.position = moveFish(fish.position, Math.sin(player.yaw) * weapon.knockback, Math.cos(player.yaw) * weapon.knockback).position;
  if (died) fish.position = corpsePosition(world, fish.position);
  return died;
}

/** Preserve the public fist helper while sharing the exact same attack path. */
export function punchFish(world: World, fish: Fish, player: Player): boolean {
  return attackFish(world, fish, player, PUNCH);
}
