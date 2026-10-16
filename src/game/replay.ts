import { Game } from './game.ts';
import type { GameState, ResetOptions } from './types.ts';

export interface ReplayOptions extends ResetOptions { inputs: {tick:number;action:unknown}[]; totalTicks:number; renderHz:30|60|120 }
const ACTIONS=['move','look','jump','pause','resume','setMode','primaryDown','primaryUp','cancelFishing','interact','eat','sell','buy','equip','openInventory','closeInventory','openShop','closeShop','openSettings','closeSettings','updateSettings','save','load','restart'];
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}

export function validateReplay(value:unknown):ReplayOptions {
  if(!record(value)||Object.keys(value).some(key=>!['seed','fixture','initial','inputs','totalTicks','renderHz'].includes(key))||
    typeof value.totalTicks!=='number'||!Number.isInteger(value.totalTicks)||value.totalTicks<0||value.totalTicks>36000||
    ![30,60,120].includes(value.renderHz as number)||!Array.isArray(value.inputs)||value.inputs.length>100000||
    Object.keys(value.inputs).length!==value.inputs.length)throw new TypeError('Invalid replay options');
  // The existing production reset validates the entire initial world before the current one changes.
  new Game().reset({seed:value.seed,fixture:value.fixture,...(value.initial===undefined?{}:{initial:value.initial})});
  for(const entry of value.inputs){
    if(!record(entry)||Object.keys(entry).length!==2||!Object.hasOwn(entry,'tick')||!Object.hasOwn(entry,'action')||
      typeof entry.tick!=='number'||!Number.isInteger(entry.tick)||entry.tick<0||entry.tick>=value.totalTicks||
      !record(entry.action)||!ACTIONS.includes(entry.action.type as string))throw new TypeError('Invalid replay input; unknown action type');
  }
  const options=structuredClone(value) as unknown as ReplayOptions;
  options.inputs.sort((a,b)=>a.tick-b.tick);return options;
}

/** Rational rendering schedule; every logic slot still calls the same production dispatch and step. */
export async function replay(game:Game, options:ReplayOptions, dispatch:(action:unknown)=>unknown=action=>game.dispatch(action), render:()=>void=()=>{}):Promise<GameState> {
  let slot=0;let input=0;let frame=1;
  while(slot<options.totalTicks){
    const target=Math.min(options.totalTicks,Math.floor(frame*60/options.renderHz));
    while(slot<target){
      while(input<options.inputs.length&&options.inputs[input].tick===slot)await dispatch(options.inputs[input++].action);
      game.step();slot++;
    }
    render();frame++;
  }
  if(options.totalTicks===0)render();
  return game.getState();
}
