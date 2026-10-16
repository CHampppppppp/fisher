export type FishSpecies = 'sprat' | 'bass' | 'tuna' | 'golden';

interface FishDefinition {
  readonly name: string;
  readonly probability: number;
  readonly rarity: string;
  readonly struggle: number;
  readonly jumpInterval: number;
  readonly jumpDistance: number;
  readonly hp: number;
}

/** Shared production names, rarity and physics; visuals never consume fish RNG. */
export const FISH_SPECIES: Readonly<Record<FishSpecies, FishDefinition>> = Object.freeze({
  sprat: Object.freeze({ name: '银鳍鱼', probability: 55, rarity: '普通', struggle: 8, jumpInterval: 1.8, jumpDistance: .9, hp: 20 }),
  bass: Object.freeze({ name: '岩鲈鱼', probability: 28, rarity: '常见', struggle: 12, jumpInterval: 1.4, jumpDistance: 1.2, hp: 45 }),
  tuna: Object.freeze({ name: '蓝背鱼', probability: 14, rarity: '稀有', struggle: 16, jumpInterval: 1.2, jumpDistance: 1.4, hp: 90 }),
  golden: Object.freeze({ name: '金鳞鱼', probability: 3, rarity: '极稀有', struggle: 20, jumpInterval: .9, jumpDistance: 1.8, hp: 150 }),
});

/** Advance only when a bite becomes reeling. The caller owns the independent state. */
export function sampleFish(previous: number): { state: number; species: FishSpecies } {
  let state = previous;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  const u = state / 4294967296;
  const species = u < .55 ? 'sprat' : u < .83 ? 'bass' : u < .97 ? 'tuna' : 'golden';
  return { state, species };
}
