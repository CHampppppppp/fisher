import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';
declare global { interface Window { __islandTest?: IslandTest } }

async function lock(page: import('@playwright/test').Page) {
  await page.keyboard.press('Escape'); await page.getByRole('button',{name:'继续探索'}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
}

test('real punches, E pickup and Tab food selection consume the same corpse exactly once', async ({page})=>{
  const errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=1');
  await page.evaluate(async()=>{
    await window.__islandTest!.reset({seed:1,fixture:'fish-arena',initial:{player:{hp:80,hunger:90}}});
    await window.__islandTest!.dispatch({type:'setMode',mode:'combat'});
  }); await lock(page);
  await page.mouse.down(); await page.mouse.up(); await page.evaluate(()=>window.__islandTest!.advanceTicks(27));
  await page.mouse.down(); await page.mouse.up(); await page.keyboard.press('KeyE');
  let state=await page.evaluate(()=>window.__islandTest!.getState()); expect(state.fish).toHaveLength(0); expect(state.inventory).toHaveLength(1);
  await expect(page.locator('#live-fish-status')).toBeHidden();
  await page.keyboard.press('Tab'); await expect(page.locator('#inventory-menu')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(false);
  const frozen=await page.evaluate(()=>window.__islandTest!.getState()); await page.evaluate(()=>window.__islandTest!.advanceTicks(300));
  expect(await page.evaluate(()=>window.__islandTest!.getState())).toEqual(frozen);
  const item=page.locator('.inventory-item'); await expect(item).toContainText('银鳍鱼'); await expect(item).toContainText('+12'); await item.click();
  await page.screenshot({path:test.info().outputPath('inventory-1280.png')});
  await page.locator('#eat-button').click(); state=await page.evaluate(()=>window.__islandTest!.getState());
  expect(state.player.hunger).toBe(100); expect(state.player.hp).toBe(80); expect(state.inventory).toHaveLength(0);
  expect(state.consumedFish[0].id).toBe(frozen.inventory[0].id); expect(state.events.filter(e=>e.type==='eat')).toHaveLength(1);
  await expect(page.locator('#inventory-status')).toContainText('已食用'); await expect(page.locator('#eat-button')).toBeDisabled();
  await expect(page.locator('#inventory-vitals')).toContainText('生命 80 / 100'); await expect(page.locator('#inventory-vitals')).toContainText('饥饿 100 / 100');
  await page.locator('#close-inventory').click(); await page.evaluate(()=>window.__islandTest!.advanceTicks(60));
  state=await page.evaluate(()=>window.__islandTest!.getState()); expect(state.player.hunger).toBe(99.9); expect(state.player.hp).toBe(80);
  expect(errors).toEqual([]);
});

test('low hunger inventory freezes on blur, food is immediate, close still requires explicit continue',async({page})=>{
  await page.setViewportSize({width:1920,height:1080}); await page.goto('/?test=1');
  await page.evaluate(()=>window.__islandTest!.reset({seed:2,fixture:'shore',initial:{player:{hp:80,hunger:19.5},inventory:[{id:'gold',species:'golden'},{id:'bass',species:'bass'}]}}));
  await lock(page); await expect(page.locator('#survival-warning')).toBeVisible();
  await page.screenshot({path:test.info().outputPath('low-hunger-1920.png')});
  await page.keyboard.down('KeyW'); await page.keyboard.press('Tab');
  await expect(page.locator('#inventory-count')).toContainText('2 / 10');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); const before=await page.evaluate(()=>window.__islandTest!.getState());
  await page.evaluate(()=>window.__islandTest!.advanceTicks(300)); expect(await page.evaluate(()=>window.__islandTest!.getState())).toEqual(before);
  await page.locator('.inventory-item').filter({hasText:'金鳞鱼'}).click(); await page.locator('#eat-button').click();
  await expect(page.locator('#hunger-value')).toHaveText('59.5'); await expect(page.locator('#hp-value')).toHaveText('80');
  await page.screenshot({path:test.info().outputPath('inventory-food-1920.png')});
  await page.locator('#close-inventory').click(); await expect(page.getByRole('button',{name:'继续探索'})).toBeVisible();
  await page.evaluate(()=>window.__islandTest!.advanceTicks(300)); expect((await page.evaluate(()=>window.__islandTest!.getState())).player.hunger).toBe(59.5);
  await page.getByRole('button',{name:'继续探索'}).click(); await page.keyboard.up('KeyW'); await page.evaluate(()=>window.__islandTest!.advanceTicks(60));
  const after=await page.evaluate(()=>window.__islandTest!.getState()); expect(after.player.hunger).toBe(59.4); expect(after.player.hp).toBe(80); expect(after.player.position).toEqual(before.player.position);
});

test('capacity and hunger-full failures are visible; death freezes and confirmed restart begins a fist session',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{inventory:Array.from({length:10},(_,i)=>({id:`food-${i}`,species:'sprat'})),fish:[{id:'body',species:'sprat',state:'groundedDead',hp:0,position:{x:0,y:1,z:1},jumpTimer:0}]}}));
  await lock(page); await page.keyboard.press('KeyE'); await expect(page.locator('#interaction-feedback')).toContainText('背包已满');
  await page.keyboard.press('Tab'); await expect(page.locator('.inventory-item')).toHaveCount(10);
  const ids = await page.locator('.inventory-item').evaluateAll(buttons=>buttons.map(button=>(button as HTMLElement).dataset.fishId));
  expect(ids).toEqual((await page.evaluate(()=>window.__islandTest!.getState())).inventory.map(item=>item.id));
  await page.locator('.inventory-item').first().click(); await page.locator('#eat-button').click(); await expect(page.locator('#inventory-status')).toContainText('饥饿已满');
  expect((await page.evaluate(()=>window.__islandTest!.getState())).inventory).toHaveLength(10);
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{hp:1,hunger:0}}})); await lock(page);
  await page.keyboard.down('KeyW'); await page.evaluate(()=>window.__islandTest!.advanceTicks(30));
  await expect(page.getByRole('button',{name:'重新开始',exact:true})).toBeVisible(); await expect(page.locator('#menu-description')).toContainText('生命耗尽');
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(false);
  const dead=await page.evaluate(()=>window.__islandTest!.getState()); await page.evaluate(()=>window.__islandTest!.advanceTicks(300)); expect(await page.evaluate(()=>window.__islandTest!.getState())).toEqual(dead);
  await page.keyboard.up('KeyW'); await page.screenshot({path:test.info().outputPath('game-over-1280.png')});
  page.once('dialog',d=>d.accept()); await page.getByRole('button',{name:'重新开始',exact:true}).click();
  const fresh=await page.evaluate(()=>window.__islandTest!.getState()); expect(fresh.player.hp).toBe(100); expect(fresh.player.hunger).toBe(100); expect(fresh.mode).toBe('combat'); expect(fresh.inventory).toHaveLength(0);
  await page.evaluate(()=>window.__islandTest!.advanceTicks(60)); expect((await page.evaluate(()=>window.__islandTest!.getState())).player.position).toEqual(fresh.player.position);
  expect(errors).toEqual([]);
});
