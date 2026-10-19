import { BODY } from './types.ts';
import type { Fish, Player } from './types.ts';
import { shopBlocks } from './fishing.ts';

export const INVENTORY_CAPACITY = 10;
export const FOOD = Object.freeze({ sprat: 12, bass: 20, tuna: 30, golden: 40 });

/** Fixed-step hunger calculation; v2 saves use a normalized baseline. */
export class Survival {
  private hungerTicks = 0;
  private damageTicks = 0;
  constructor(private hpBase = 100, private hungerBase = 100) {}

  snapshot(): { hpBase: number; hungerBase: number; hungerTicks: number; damageTicks: number } {
    return { hpBase: this.hpBase, hungerBase: Math.max(0, this.hungerBase - this.hungerTicks / 600), hungerTicks: 0, damageTicks: this.damageTicks };
  }

  static restore(value: ReturnType<Survival['snapshot']>): Survival {
    const result = new Survival(value.hpBase, Math.max(0, value.hungerBase - value.hungerTicks / 600));
    result.damageTicks = value.damageTicks;
    return result;
  }

  eat(player: Player, recovery: number): void {
    player.hunger = Math.min(100, player.hunger + recovery);
    this.hungerBase = player.hunger; this.hungerTicks = 0;
  }

  damage(player: Player, amount: number): void {
    player.hp = Math.max(0, player.hp - amount);
    this.hpBase = player.hp; this.damageTicks = 0;
  }

  step(player: Player): void {
    player.hunger = Math.max(0, this.hungerBase - ++this.hungerTicks / 600);
    if (player.hunger < 20) player.hp = Math.max(0, this.hpBase - ++this.damageTicks / 30);
  }
}

/** E has no aim cone; the nearest corpse still needs actual reach and an unobstructed path. */
export function pickupTarget(player: Player, fish: Fish[]): Fish | null {
  const eye = { ...player.position, y: player.position.y + BODY.height * .9 };
  let target: Fish | null = null; let nearest = Infinity;
  for (const candidate of fish) {
    if (candidate.state !== 'groundedDead') continue;
    const distance = Math.hypot(candidate.position.x - player.position.x,
      candidate.position.y - player.position.y, candidate.position.z - player.position.z);
    if (distance > 2 + 1e-9 || distance >= nearest || shopBlocks(eye, { ...candidate.position, y: candidate.position.y + .2 })) continue;
    target = candidate; nearest = distance;
  }
  return target;
}
