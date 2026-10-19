export const BINDING_ACTIONS = ['forward','backward','left','right','sprint','jump','dive','interact','cancelFishing','slot1','slot2','slot3','slot4','slot5','slot6','slot7','slot8','slot9'] as const;
export type BindingAction = typeof BINDING_ACTIONS[number];
export interface Settings { volume: number; sensitivity: number; bindings: Record<BindingAction,string> }
export const SETTINGS_KEY = 'island-fishing-settings-v2';
export const SENSITIVITY = Object.freeze({ min:.25, max:3, default:1 });
export const BINDING_LABELS:Record<BindingAction,string> = {forward:'前进',backward:'后退',left:'左移',right:'右移',sprint:'冲刺',jump:'跳跃 / 上浮',dive:'下潜',interact:'交互 / 放鱼 / 拾取',cancelFishing:'收回鱼竿',slot1:'鱼竿',slot2:'拳头',slot3:'木棍',slot4:'鱼叉',slot5:'重锤',slot6:'银鳍鱼',slot7:'岩鲈鱼',slot8:'蓝背鱼',slot9:'金鳞鱼'};
export function defaultSettings(): Settings {return {volume:100,sensitivity:1,bindings:{forward:'KeyW',backward:'KeyS',left:'KeyA',right:'KeyD',sprint:'ShiftLeft',jump:'Space',dive:'ControlLeft',interact:'KeyE',cancelFishing:'KeyR',slot1:'Digit1',slot2:'Digit2',slot3:'Digit3',slot4:'Digit4',slot5:'Digit5',slot6:'Digit6',slot7:'Digit7',slot8:'Digit8',slot9:'Digit9'}};}
export class SettingsError extends Error {constructor(readonly reason:string){super(reason);}}
function fail(reason:string):never {throw new SettingsError(reason);}
function record(value:unknown): value is Record<string,unknown> {return Boolean(value)&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;}
export function keyLabel(code:string):string {
  if(/^Key[A-Z]$/.test(code))return code.slice(3);if(/^Digit[0-9]$/.test(code))return code.slice(5);
  const names:Record<string,string>={Space:'SPACE',Tab:'TAB',ShiftLeft:'SHIFT',ShiftRight:'右SHIFT',ControlLeft:'CTRL',ControlRight:'右CTRL',AltLeft:'ALT',AltRight:'右ALT',ArrowUp:'↑',ArrowDown:'↓',ArrowLeft:'←',ArrowRight:'→',Escape:'ESC',Enter:'ENTER',Backspace:'退格'};
  return names[code]??code;
}
export function bindingCodes(action:BindingAction,code:string):string[] {
  if(action==='sprint'&&code==='ShiftLeft')return [code,'ShiftRight'];
  if(action==='dive'&&code==='ControlLeft')return [code,'ControlRight'];
  if(action.startsWith('slot')&&code===`Digit${action.at(-1)}`)return [code,`Numpad${action.at(-1)}`];
  return [code];
}
export function bindingAction(settings:Settings,code:string):BindingAction|undefined {return BINDING_ACTIONS.find(action=>bindingCodes(action,settings.bindings[action]).includes(code));}
export function updateSettings(current:Settings,value:unknown):Settings {
  if(!record(value)||Object.keys(value).length===0||Object.keys(value).some(key=>!['volume','sensitivity','bindings'].includes(key)))fail('invalid-settings');
  const next=structuredClone(current);
  if(Object.hasOwn(value,'volume')){if(typeof value.volume!=='number'||!Number.isFinite(value.volume)||value.volume<0||value.volume>100)fail('invalid-volume');next.volume=value.volume;}
  if(Object.hasOwn(value,'sensitivity')){if(typeof value.sensitivity!=='number'||!Number.isFinite(value.sensitivity)||value.sensitivity<SENSITIVITY.min||value.sensitivity>SENSITIVITY.max)fail('invalid-sensitivity');next.sensitivity=value.sensitivity;}
  if(Object.hasOwn(value,'bindings')){
    if(!record(value.bindings)||Object.keys(value.bindings).length===0||Object.keys(value.bindings).some(key=>!BINDING_ACTIONS.includes(key as BindingAction)))fail('invalid-bindings');
    Object.assign(next.bindings,value.bindings);
  }
  const used=new Set<string>();
  for(const action of BINDING_ACTIONS){const code=next.bindings[action];
    if(['Escape','Tab'].includes(code))fail('reserved-key');
    if(typeof code!=='string'||!(/^(Key[A-Z]|Digit[0-9]|Numpad[0-9]|Arrow(Up|Down|Left|Right)|Shift(Left|Right)|Control(Left|Right)|Alt(Left|Right))$/.test(code)||['Space','Tab','Enter','Backspace','Delete','Home','End','PageUp','PageDown','BracketLeft','BracketRight','Comma','Period','Slash','Semicolon','Quote','Backslash','Minus','Equal'].includes(code)))fail('invalid-key');
    for(const accepted of bindingCodes(action,code)){if(used.has(accepted))fail('binding-conflict');used.add(accepted);}
  }
  return next;
}
export function readSettings(): {settings:Settings;error?:string} {
  try {
    const raw=localStorage.getItem(SETTINGS_KEY);if(raw===null)return {settings:defaultSettings()};
    const value:unknown=JSON.parse(raw);if(!record(value)||value.version!==1||Object.keys(value).length!==2||!record(value.settings)||Object.keys(value.settings).length!==3||!record(value.settings.bindings)||Object.keys(value.settings.bindings).length!==BINDING_ACTIONS.length)throw new SettingsError('invalid-settings');
    return {settings:updateSettings(defaultSettings(),value.settings)};
  }catch{return {settings:defaultSettings(),error:'设置读取失败，已使用默认值；原记录未覆盖。'};}
}
export function writeSettings(settings:Settings):void {localStorage.setItem(SETTINGS_KEY,JSON.stringify({version:1,settings}));}
