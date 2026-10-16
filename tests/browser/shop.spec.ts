import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';
declare global { interface Window { __islandTest?: IslandTest } }

async function lock(page: import('@playwright/test').Page) {
  await page.keyboard.press('Escape'); await page.getByRole('button',{name:'继续探索'}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
}
const inventory=[{id:'sprat-sale',species:'sprat'},{id:'trade-1',species:'bass'},{id:'tuna-sale',species:'tuna'},{id:'gold-sale',species:'golden'}];

test('actual E opens the counter, lists exact prices and sells one original corpse with immediate balance feedback',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
  await page.evaluate(inventory=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-2},hp:80,hunger:19.5},coins:20,inventory,
    fish:[{id:'living',species:'sprat',state:'groundedAlive',position:{x:0,y:1,z:5},jumpTimer:0}]}}),inventory);
  await lock(page); await page.keyboard.down('KeyW'); await page.keyboard.press('KeyE'); await expect(page.locator('#shop-menu')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(false);
  const frozen=await page.evaluate(()=>window.__islandTest!.getState());await page.evaluate(()=>window.__islandTest!.advanceTicks(600));expect(await page.evaluate(()=>window.__islandTest!.getState())).toEqual(frozen);
  const ids=await page.locator('.shop-item').evaluateAll(buttons=>buttons.map(button=>(button as HTMLElement).dataset.fishId));expect(ids).toEqual(frozen.inventory.map(item=>item.id));
  for(const [name,price] of [['银鳍鱼',8],['岩鲈鱼',20],['蓝背鱼',45],['金鳞鱼',120]]) await expect(page.locator('.shop-item').filter({hasText:String(name)})).toContainText(`${price} 金币`);
  await page.locator('.shop-item').filter({hasText:'岩鲈鱼'}).click();await page.screenshot({path:test.info().outputPath('shop-selected-1280.png')});
  await page.locator('#sell-button').click();let state=await page.evaluate(()=>window.__islandTest!.getState());expect(state.coins).toBe(40);expect(state.inventory).toHaveLength(3);
  expect(state.terminalFish[0].state).toBe('sold');expect(state.terminalFish[0].id).toBe('trade-1');expect(state.events.filter(e=>e.type==='sell')).toHaveLength(1);
  await expect(page.locator('#shop-balance')).toContainText('40');await expect(page.locator('#coins-value')).toHaveText('40');await expect(page.locator('#shop-status')).toContainText('已出售');
  await page.evaluate(()=>window.__islandTest!.dispatch({type:'sell',fishId:'trade-1'}));await expect(page.locator('#shop-status')).toContainText('已消费或不在背包');
  await expect(page.locator('#fish-notice')).toBeHidden();await page.locator('#close-shop').click();await page.keyboard.up('KeyW');await page.evaluate(()=>window.__islandTest!.advanceTicks(1));
  state=await page.evaluate(()=>window.__islandTest!.getState());expect(state.player.position).toEqual(frozen.player.position);expect(state.player.hp).toBeCloseTo(80-1/30,6);expect(state.player.hunger).toBeCloseTo(19.5-1/600,6);expect(state.coins).toBe(40);
  expect(errors).toEqual([]);
});

test('1920 shop pauses reel and survival; blur keeps pause on close, empty and stale selections never grant coins',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});await page.goto('/?test=1');
  await page.evaluate(async()=>{
    const api=window.__islandTest!;await api.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-3},yaw:Math.PI,hp:80,hunger:19.5},coins:20,inventory:[{id:'gold',species:'golden'}]}});
    await api.dispatch({type:'primaryDown'});await api.advanceTicks(60);await api.dispatch({type:'primaryUp'});await api.advanceTicks(120);await api.dispatch({type:'primaryDown'});
  });await lock(page);await page.keyboard.press('KeyE');await expect(page.locator('#shop-menu')).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const frozen=await page.evaluate(()=>window.__islandTest!.getState());await page.evaluate(()=>window.__islandTest!.advanceTicks(600));expect(await page.evaluate(()=>window.__islandTest!.getState())).toEqual(frozen);
  for(const id of ['shop-balance','sell-button','close-shop','shop-vitals']) await expect(page.locator(`#${id}`)).toBeInViewport();
  await page.locator('.shop-item').click();await page.locator('#sell-button').click();await expect(page.locator('#shop-balance')).toContainText('140');await expect(page.locator('#shop-list')).toContainText('背包为空');
  await expect(page.locator('#sell-button')).toBeDisabled();await page.evaluate(()=>window.__islandTest!.dispatch({type:'sell',fishId:'gold'}));await expect(page.locator('#shop-status')).toContainText('已消费或不在背包');
  await page.screenshot({path:test.info().outputPath('shop-empty-1920.png')});await page.locator('#close-shop').click();await expect(page.getByRole('button',{name:'继续探索'})).toBeVisible();
  await page.evaluate(()=>window.__islandTest!.advanceTicks(300));const paused=await page.evaluate(()=>window.__islandTest!.getState());expect(paused.player).toEqual(frozen.player);expect(paused.fishing).toEqual(frozen.fishing);
  await page.getByRole('button',{name:'继续探索'}).click();await page.evaluate(()=>window.__islandTest!.advanceTicks(6));const after=await page.evaluate(()=>window.__islandTest!.getState());
  expect(after.fishing.progress).toBe(frozen.fishing.progress);expect(after.fishing.tension).toBeCloseTo(frozen.fishing.tension-2,6);expect(after.coins).toBe(140);
});

test('actual adapter rejects wall and far shop access; eat and sell share one consumption source',async({page})=>{
  await page.goto('/?test=1');const result=await page.evaluate(async()=>{
    const api=window.__islandTest!;const rejected=[];
    for(const position of [{x:-6,y:1,z:-3.56},{x:-4.1,y:1,z:-1},{x:-6,y:1,z:1.9}]) {
      await api.reset({seed:1,fixture:'shore',initial:{player:{position},coins:20,inventory:[{id:'x',species:'bass'}]}});rejected.push(await api.dispatch({type:'openShop'}));
    }
    await api.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-2},hunger:50},coins:20,inventory:[{id:'eat-first',species:'sprat'},{id:'sell-first',species:'bass'}]}});
    await api.dispatch({type:'eat',fishId:'eat-first'});await api.dispatch({type:'openShop'});const eaten=await api.dispatch({type:'sell',fishId:'eat-first'});
    const sold=await api.dispatch({type:'sell',fishId:'sell-first'});const repeat=await api.dispatch({type:'eat',fishId:'sell-first'});return {rejected,eaten,sold,repeat,state:await api.getState()};
  });
  expect(result.rejected.every(action=>!action.accepted)).toBe(true);expect(result.rejected[1].reason).toBe('shop-obstructed');expect(result.eaten.accepted).toBe(false);expect(result.sold.accepted).toBe(true);expect(result.repeat.accepted).toBe(false);
  expect(result.state.coins).toBe(40);expect(result.state.player.hunger).toBe(62);expect(result.state.inventory).toHaveLength(0);expect(result.state.consumedFish).toHaveLength(1);expect(result.state.terminalFish.filter(f=>f.state==='sold')).toHaveLength(1);
  await expect(page.locator('#shop-status')).toContainText('已消费或不在背包');
});
