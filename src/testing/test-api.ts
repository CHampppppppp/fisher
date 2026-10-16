import type { Game } from '../game/game.ts';
import type { GameState } from '../game/types.ts';
import type { GameClock } from '../game/clock.ts';
import type { Controller } from '../game/controller.ts';
import type { IslandView } from '../render/scene.ts';
import type { UI } from '../ui/ui.ts';
import type { Persistence, SaveResult } from '../game/persistence.ts';
import type { SaveFile } from '../game/save-format.ts';
import { validateReplay, replay } from '../game/replay.ts';

export interface IslandTest {
  reset(options: unknown): Promise<void>;
  getState(): Promise<GameState>;
  advanceTicks(count: unknown): Promise<void>;
  dispatch(action: unknown): Promise<GameState['lastAction']>;
  waitUntilIdle(): Promise<void>;
  exportSave(): Promise<SaveFile>;
  importSave(value: unknown): Promise<SaveResult>;
  runReplay(value: unknown): Promise<GameState>;
}

export function registerTestApi(game: Game, clock: GameClock, controller: Controller, view: IslandView,
  ui: UI, draw: () => void, initialized: Promise<void>, persistence: Persistence, realClock = false,
  onReplayStart: () => void = () => {}): void {
  const api: IslandTest = {
    async reset(options) {
      await persistence.waitUntilIdle();
      game.reset(options); // Validate and commit before touching scene, UI or the clock.
      if (!realClock) clock.useManualClock(); else clock.resetTime();
      controller.clearInput(); ui.markStarted(); ui.setMessage('');
      view.rebuild(game.getWorld()); draw();
    },
    async getState() { return game.getState(); },
    async advanceTicks(count) {
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > 36000)
        throw new RangeError('count must be an integer in [0,36000]');
      await persistence.waitUntilIdle(); clock.useManualClock(); game.advanceTicks(count); draw();
    },
    async dispatch(action) {
      return controller.dispatchAsync(action);
    },
    async exportSave() { return persistence.exportSave(); },
    async importSave(value) { return persistence.importSave(value); },
    async runReplay(value) {
      const options = validateReplay(value); await persistence.waitUntilIdle(); await controller.prepareReplay();
      game.reset({seed:options.seed,fixture:options.fixture,...(options.initial===undefined?{}:{initial:options.initial})},true);
      onReplayStart();
      clock.useManualClock(); controller.clearInput(); ui.markStarted(); view.rebuild(game.getWorld());
      const result = await replay(game,options,action=>controller.dispatchAsync(action),draw); draw(); return result;
    },
    async waitUntilIdle() {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([Promise.all([initialized,persistence.waitUntilIdle()]), new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Initialization timed out after 5000 ms')), 5000);
        })]);
      } finally { clearTimeout(timeout); }
    },
  };
  Object.defineProperty(window, '__islandTest', { value: Object.freeze(api), configurable: true });
}
