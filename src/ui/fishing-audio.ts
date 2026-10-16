import type { GameState } from '../game/types.ts';
import type { WeaponId } from '../game/weapons.ts';

const CUES: Record<WeaponId, { wave: OscillatorType; swing: number; impact: number; end: number; duration: number }> = {
  fist: {wave:'sawtooth',swing:100,impact:180,end:45,duration:.20},
  club: {wave:'triangle',swing:220,impact:130,end:60,duration:.24},
  spear: {wave:'square',swing:520,impact:420,end:170,duration:.13},
  hammer: {wave:'sawtooth',swing:55,impact:65,end:25,duration:.36},
};

/** Local synthesized cue, unlocked only by a genuine browser user gesture. */
export class FishingAudio {
  private context: AudioContext | null = null;
  private events = new AbortController();
  private lastSequence = 0;
  private paused = false;
  private volume = 100;
  private master: GainNode | null = null;

  constructor() {
    const unlock = (event: Event) => {
      if (!event.isTrusted || (navigator.userActivation && !navigator.userActivation.isActive)) return;
      if (!this.context && typeof AudioContext !== 'undefined') {
        this.context = new AudioContext(); this.master = this.context.createGain();
        this.master.gain.value = this.volume / 100; this.master.connect(this.context.destination);
        if (this.paused) void this.context.suspend().catch(error => console.warn('Sound could not pause', error));
      }
      if (this.context?.state === 'suspended' && !this.paused) void this.context.resume().catch(error => console.warn('Sound could not start', error));
    };
    document.addEventListener('pointerdown', unlock, { capture: true, signal: this.events.signal });
    document.addEventListener('keydown', unlock, { capture: true, signal: this.events.signal });
  }

  update(state: GameState): void {
    this.volume = state.settings.volume;
    if (this.master) this.master.gain.value = this.volume / 100;
    const paused = state.gamePhase !== 'running';
    if (this.context && paused !== this.paused) {
      const operation = paused ? this.context.suspend() : this.context.resume();
      void operation.catch(error => console.warn('Sound state could not change', error));
    }
    this.paused = paused;
    for (const event of state.events) {
      if (event.sequence <= this.lastSequence) continue;
      this.lastSequence = event.sequence;
      if (!['bite','punch','weapon_attack','fish_damage','boss_damage'].includes(event.type) || paused || !this.context) continue;
      const oscillator = this.context.createOscillator(); const gain = this.context.createGain();
      const now = this.context.currentTime;
      const bite = event.type === 'bite'; const impact = event.type === 'fish_damage'||event.type==='boss_damage';
      const cue = CUES[event.weaponId ?? 'fist']; const duration = bite ? .20 : cue.duration;
      oscillator.type = bite ? 'sine' : impact ? 'triangle' : cue.wave;
      oscillator.frequency.setValueAtTime(bite ? 880 : impact ? cue.impact : cue.swing, now);
      oscillator.frequency.exponentialRampToValueAtTime(bite ? 560 : cue.end, now + duration * .8);
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(bite ? .08 : impact ? .065 : .025, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain); gain.connect(this.master!);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(now); oscillator.stop(now + duration + .01);
    }
  }

  dispose(): void {
    this.events.abort();
    if (this.context) void this.context.close().catch(error => console.warn('Sound could not close', error));
  }

  clearHistory(): void { this.lastSequence = 0; }
}
