import {test,expect,type Page} from '@playwright/test';
import type {IslandTest} from '../../src/testing/test-api.ts';
declare global {interface Window {__islandTest?:IslandTest}}
const state=(page:Page)=>page.evaluate(()=>window.__islandTest!.getState());
const tick=(page:Page,count:number)=>page.evaluate(n=>window.__islandTest!.advanceTicks(n),count);
async function locked(page:Page){await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);}
async function paused(page:Page){await expect.poll(async()=>(await state(page)).gamePhase).toBe('paused');await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(false);}

test('Escape resumes the pause menu without a mouse click or stale held input',async({page})=>{
 await page.goto('/?test=1');await page.locator('#play-button').click();await locked(page);
 await page.keyboard.down('KeyW');await tick(page,12);await page.keyboard.press('Escape');await paused(page);await page.keyboard.up('KeyW');
 const before=await state(page);await tick(page,300);expect(await state(page)).toEqual(before);
 await page.keyboard.press('Escape');await locked(page);expect((await state(page)).gamePhase).toBe('running');await expect(page.locator('#menu')).toBeHidden();await expect(page.locator('#hud')).toBeVisible();
 await tick(page,30);expect((await state(page)).player.position).toEqual(before.player.position);
 await page.keyboard.down('KeyD');await tick(page,15);await page.keyboard.up('KeyD');expect((await state(page)).player.position).not.toEqual(before.player.position);
 await page.screenshot({path:test.info().outputPath('escape-resumed.png')});
});
for(const exit of ['Escape','Tab','button'] as const)test(`shop ${exit} returns directly to the game with pointer control`,async({page})=>{
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-3}}}}));await page.keyboard.press('Escape');await page.locator('#play-button').click();await locked(page);
 await page.keyboard.press('KeyE');await expect(page.locator('#shop-menu')).toBeVisible();await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
 const before=await state(page);await tick(page,300);expect(await state(page)).toEqual(before);
 if(exit==='button')await page.locator('#close-shop').click();else await page.keyboard.press(exit);
 await locked(page);const after=await state(page);expect(after.gamePhase).toBe('running');expect(after.ui.menu).toBe('none');expect(after.simulationTick).toBe(before.simulationTick);await expect(page.locator('#menu')).toBeHidden();await expect(page.locator('#hud')).toBeVisible();
 await tick(page,1);expect((await state(page)).simulationTick).toBe(before.simulationTick+1);
 await page.keyboard.down('KeyD');await tick(page,12);await page.keyboard.up('KeyD');expect((await state(page)).player.position.x).toBeGreaterThan(before.player.position.x+.7);
 await page.screenshot({path:test.info().outputPath(`shop-${exit}-game.png`)});
});
test('Escape still closes help and binding capture one layer at a time; repeats do not toggle',async({page})=>{
 await page.goto('/?test=1');await page.locator('#play-button').click();await locked(page);await page.keyboard.press('Escape');await paused(page);
 await page.locator('#menu-help summary').click();await page.keyboard.press('Escape');expect((await state(page)).gamePhase).toBe('paused');expect(await page.locator('#menu-help').getAttribute('open')).toBeNull();
 await page.locator('#settings-button').click();await page.locator('[data-binding-action=interact]').click();await page.keyboard.press('Escape');expect((await state(page)).ui.menu).toBe('settings');await page.keyboard.press('Escape');expect((await state(page)).ui.menu).toBe('pause');
 await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{code:'Escape',repeat:true,bubbles:true})));expect((await state(page)).gamePhase).toBe('paused');
 await page.keyboard.press('Escape');await locked(page);expect((await state(page)).gamePhase).toBe('running');
});
test('initial and death menus cannot be started or restarted by Escape',async({page})=>{
 await page.goto('/?test=1');await page.keyboard.press('Escape');expect((await state(page)).gamePhase).toBe('paused');await expect(page.locator('#play-button')).toHaveText('开始游戏');
 await page.evaluate(async()=>{await window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{hp:.1,hunger:0}}});await window.__islandTest!.advanceTicks(4);});expect((await state(page)).gamePhase).toBe('dead');
 await page.keyboard.press('Escape');expect((await state(page)).gamePhase).toBe('dead');await expect(page.locator('#menu')).toBeVisible();
});
test('a rejected pointer relock keeps the resumed game visible and click-to-control works',async({page})=>{
 await page.goto('/?test=1');await page.locator('#play-button').click();await locked(page);await page.keyboard.press('Escape');await paused(page);
 await page.evaluate(()=>{const c=document.querySelector<HTMLCanvasElement>('#world')!;const request=c.requestPointerLock.bind(c);(window as any).restorePointerRequest=()=>c.requestPointerLock=request;c.requestPointerLock=()=>Promise.reject(new Error('test browser denied relock'));});
 await page.keyboard.press('Escape');await expect(page.locator('#menu')).toBeHidden();await expect(page.locator('#pointer-hint')).toBeVisible();expect((await state(page)).gamePhase).toBe('running');
 await page.evaluate(()=>(window as any).restorePointerRequest());await page.locator('#world').click({position:{x:900,y:300}});await locked(page);expect((await state(page)).fishing.phase).toBe('idle');
 await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await paused(page);
});
test('a stale pointer rejection cannot cancel a newer Escape resume request',async({page})=>{
 await page.goto('/?test=1');await page.locator('#play-button').click();await locked(page);await page.keyboard.press('Escape');await paused(page);
 await page.evaluate(()=>{const c=document.querySelector<HTMLCanvasElement>('#world')!;const original=c.requestPointerLock.bind(c);const pending:{reject:(e:Error)=>void}[]=[];(window as any).pendingLocks=pending;(window as any).restorePointerRequest=()=>c.requestPointerLock=original;c.requestPointerLock=()=>new Promise<void>((_,reject)=>pending.push({reject}));});
 await page.keyboard.press('Escape');expect((await state(page)).gamePhase).toBe('running');await page.keyboard.press('Escape');expect((await state(page)).gamePhase).toBe('paused');await page.keyboard.press('Escape');
 expect(await page.evaluate(()=>(window as any).pendingLocks.length)).toBe(2);
 await page.evaluate(async()=>{document.dispatchEvent(new Event('pointerlockerror'));(window as any).pendingLocks[0].reject(new Error('stale A'));await Promise.resolve();});
 await page.locator('#world').click({position:{x:900,y:300}});expect(await page.evaluate(()=>(window as any).pendingLocks.length)).toBe(2);
 await page.evaluate(async()=>{(window as any).pendingLocks[1].reject(new Error('current B'));await Promise.resolve();(window as any).restorePointerRequest();});
 expect((await state(page)).gamePhase).toBe('running');await page.locator('#world').click({position:{x:900,y:300}});await locked(page);await expect(page.locator('#pointer-hint')).toBeHidden();
});
