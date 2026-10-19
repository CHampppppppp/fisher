export type WeaponId = 'fist' | 'club' | 'spear' | 'hammer';
export interface WeaponDefinition {
  readonly name: string;
  readonly price: number;
  readonly damage: number;
  readonly range: number;
  readonly cooldownTicks: number;
  readonly hitTick:number;
  readonly knockback: number;
  readonly animationSeconds: number;
}

/** One table for production transactions, targeting, HUD and attack presentation. */
export const WEAPONS: Readonly<Record<WeaponId, Readonly<WeaponDefinition>>> = Object.freeze({
  fist: Object.freeze({ name: '拳头', price: 0, damage: 10, range: 2, cooldownTicks: 18, hitTick:6, knockback: .1, animationSeconds: .30 }),
  club: Object.freeze({ name: '木棍', price: 30, damage: 25, range: 2, cooldownTicks: 42, hitTick:12, knockback: .5, animationSeconds: .70 }),
  spear: Object.freeze({ name: '鱼叉', price: 120, damage: 40, range: 3.2, cooldownTicks: 48, hitTick:10, knockback: .25, animationSeconds: .80 }),
  hammer: Object.freeze({ name: '重锤', price: 300, damage: 65, range: 2, cooldownTicks: 66, hitTick:20, knockback: 1.2, animationSeconds: 1.10 }),
});
export const WEAPON_IDS: readonly WeaponId[] = Object.freeze(['fist', 'club', 'spear', 'hammer']);
export function isWeaponId(value: unknown): value is WeaponId {
  return typeof value === 'string' && Object.hasOwn(WEAPONS, value);
}
