import { STEP } from './types.ts';
import { FISH_SPECIES } from './fish-species.ts';
import type { FishSpecies } from './fish-species.ts';

export interface ReelState {
  ticks: number;
  progressTicks: number;
  tension: number;
  highTicks: number;
  lowTicks: number;
}
export type ReelOutcome = 'line-broken' | 'unhooked' | 'landed' | null;
export const createReel = (): ReelState => ({ ticks: 0, progressTicks: 0, tension: 40, highTicks: 0, lowTicks: 0 });
export const isStruggling = (ticks: number): boolean => ticks >= 120 && ticks % 120 < 30;

/** Called once per real production step; integer counters make threshold edges exact. */
export function stepReel(previous: ReelState, holding: boolean, species: FishSpecies): { state: ReelState; outcome: ReelOutcome } {
  const ticks = previous.ticks + 1;
  const change = (holding ? 30 : -20) + (isStruggling(ticks) ? FISH_SPECIES[species].struggle : 0);
  let tension = Math.max(0, Math.min(100, previous.tension + change * STEP));
  if (tension < 1e-9) tension = 0;
  if (tension > 100 - 1e-9) tension = 100;
  const state = {
    ticks, tension,
    progressTicks: Math.min(300, previous.progressTicks + (holding ? 1 : 0)),
    highTicks: tension === 100 ? previous.highTicks + 1 : 0,
    lowTicks: tension === 0 ? previous.lowTicks + 1 : 0,
  };
  const outcome = state.highTicks >= 30 ? 'line-broken' : state.lowTicks >= 30 ? 'unhooked'
    : state.progressTicks >= 300 ? 'landed' : null;
  return { state, outcome };
}
