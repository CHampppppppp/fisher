import {STEP} from './types.ts';
import {FISH_SPECIES} from './fish-species.ts';
import type {FishSpecies} from './fish-species.ts';

export interface ReelState {
  ticks:number; progressTicks:number; tension:number; highTicks:number; lowTicks:number;
  directionRngState:number; pullDirection:{x:number;y:number}; counterStrength:number;
}
export type ReelOutcome = 'line-broken'|'unhooked'|'landed'|null;
export const reelSeed=(seed:number):number=>((seed^0x9e3779b9)>>>0)||1;
function direction(previous:number):{state:number;vector:{x:number;y:number}} {
  let s=previous>>>0; s^=s<<13;s^=s>>>17;s^=s<<5;s>>>=0;
  const angle=Math.floor(s/4294967296*8)*Math.PI/4;
  return {state:s,vector:{x:Math.cos(angle),y:Math.sin(angle)}};
}
export function createReel(seed=1):ReelState {
  const draw=direction(seed);
  return {ticks:0,progressTicks:0,tension:40,highTicks:0,lowTicks:0,
    directionRngState:draw.state,pullDirection:draw.vector,counterStrength:0};
}
export const isStruggling=(ticks:number):boolean=>ticks>=120&&ticks%120<30;

/** Only production ticks draw direction; rendering never changes either random stream. */
export function stepReel(previous:ReelState,holding:boolean,species:FishSpecies,
  rodOffset={x:0,y:0}):{state:ReelState;outcome:ReelOutcome} {
  const ticks=previous.ticks+1;
  const draw=ticks%120===0?direction(previous.directionRngState):null;
  const pullDirection=draw?.vector??previous.pullDirection;
  const counterStrength=Math.max(0,Math.min(1,-rodOffset.x*pullDirection.x-rodOffset.y*pullDirection.y));
  const change=(holding?30+15*counterStrength:-20)+(isStruggling(ticks)?FISH_SPECIES[species].struggle:0);
  let tension=Math.max(0,Math.min(100,previous.tension+change*STEP));
  if(tension<1e-9)tension=0;if(tension>100-1e-9)tension=100;
  const state:ReelState={ticks,tension,pullDirection,counterStrength,
    directionRngState:draw?.state??previous.directionRngState,
    progressTicks:Math.min(300,previous.progressTicks+(holding?1+.5*counterStrength:0)),
    highTicks:tension===100?previous.highTicks+1:0,lowTicks:tension===0?previous.lowTicks+1:0};
  const outcome=state.highTicks>=30?'line-broken':state.lowTicks>=30?'unhooked':
    state.progressTicks>=300-1e-9?'landed':null;
  return {state,outcome};
}
