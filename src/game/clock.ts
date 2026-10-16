import { STEP } from './types.ts';
import type { Game } from './game.ts';

/** One owner of time: browser frames OR explicit ticks, never both. */
export class GameClock {
  private manual: boolean;
  private previous: number | null = null;
  private accumulator = 0;
  private frameId = 0;
  private disposed = false;
  private suspended = false;

  constructor(private game: Game, private draw: () => void, manual = false) { this.manual = manual; }

  start(): void { this.frameId = requestAnimationFrame(this.frame); }
  resetTime(): void { this.previous = null; this.accumulator = 0; }
  useManualClock(): void { this.manual = true; this.resetTime(); }
  suspend(): void { this.suspended = true; this.resetTime(); }
  release(): void { this.suspended = false; this.resetTime(); }

  private frame = (now: number): void => {
    if (this.disposed) return;
    const running = this.game.getState().gamePhase === 'running';
    if (!this.manual && !this.suspended && running) {
      if (this.previous !== null) this.accumulator += Math.min((now - this.previous) / 1000, 0.1);
      this.previous = now;
      while (this.accumulator + 1e-10 >= STEP) { this.game.step(); this.accumulator = Math.max(0,this.accumulator - STEP); }
    } else this.resetTime();
    this.draw(); this.frameId = requestAnimationFrame(this.frame);
  };

  dispose(): void { this.disposed = true; cancelAnimationFrame(this.frameId); }
}
