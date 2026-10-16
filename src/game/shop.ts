import { BODY } from './types.ts';
import type { Player } from './types.ts';
import { SHOP } from './world.ts';
import { shopBlocks } from './fishing.ts';

export const SALE_PRICES = Object.freeze({ sprat: 8, bass: 20, tuna: 45, golden: 120 });
// The front sign/counter is on the production building's -Z face, just outside its solid wall.
export const SHOP_COUNTER = Object.freeze({ x: SHOP.x, y: SHOP.bottom, z: SHOP.z - SHOP.halfDepth - .05 });

export function shopAccess(player: Player): { valid: boolean; reason: string } {
  const p = player.position;
  if (Math.hypot(p.x - SHOP_COUNTER.x, p.y - SHOP_COUNTER.y, p.z - SHOP_COUNTER.z) > 2 + 1e-9)
    return { valid: false, reason: 'shop-too-far' };
  const eye = { ...p, y: p.y + BODY.height * .9 };
  const target = { ...SHOP_COUNTER, y: SHOP.bottom + 1.4 };
  if (shopBlocks(eye, target)) return { valid: false, reason: 'shop-obstructed' };
  return { valid: true, reason: 'openShop' };
}
