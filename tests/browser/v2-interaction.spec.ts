import {test,expect,type Page} from '@playwright/test';
import type {IslandTest} from '../../src/testing/test-api.ts';
declare global {interface Window {__islandTest?:IslandTest}}
const state=(page:Page)=>page.evaluate(()=>window.__islandTest!.getState());
const ticks=(page:Page,n:number)=>page.evaluate(n=>window.__islandTest!.advanceTicks(n),n);
async function lock(page:Page) {
  await page.keyboard.press('Escape');
  const box=await page.locator('#play-button').boundingBox();
  await page.locator('#play-button').click();
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
  return {x:box!.x+box!.width/2,y:box!.y+box!.height/2};
}
test('v2 native held walking survives charge start, release uses the moved origin and drops held movement',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=1');
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9}}}}));
  await lock(page);await page.keyboard.down('KeyD');await page.mouse.down();await ticks(page,30);
  expect((await state(page)).player.position.x).toBeCloseTo(2,5);
  await page.screenshot({path:test.info().outputPath('v2-charge-walking.png')});
  await page.mouse.up();const cast=(await state(page)).fishing.cast!;
  expect(cast.origin.x).toBeCloseTo(2,5);await ticks(page,30);
  expect((await state(page)).player.position.x).toBeCloseTo(2,5);
  await page.keyboard.up('KeyD');expect(errors).toEqual([]);
});
test('v2 native mouse counter-steers the production rod and advances real progress/tension',async({page})=>{
  await page.goto('/?test=1');
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9}}}}));
  const mouse=await lock(page);await page.mouse.down();await ticks(page,30);await page.mouse.up();await ticks(page,120);
  await expect(page.locator('#fishing-status')).toContainText('咬钩');
  await page.screenshot({path:test.info().outputPath('v2-bite.png')});
  await page.mouse.down();const dir=(await state(page)).fishing.pullDirection;
  await page.mouse.move(mouse.x-dir.x*205,mouse.y+dir.y*205);
  await ticks(page,30);const s=await state(page);
  expect(s.fishing.counterStrength).toBeGreaterThan(.95);
  expect(s.fishing.progress).toBeGreaterThan(14.5);expect(s.fishing.tension).toBeGreaterThan(62);
  await expect(page.locator('#pull-feedback')).toContainText('反向牵引');
  await page.screenshot({path:test.info().outputPath('v2-counter-pull.png')});await page.mouse.up();
  await page.keyboard.press('Escape');const paused=await state(page);await ticks(page,300);
  expect(await state(page)).toEqual(paused);await expect(page.locator('#fishing-info')).toBeHidden();
});
test('v2 native clicks buffer the opposite fist and real damage renders blood',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'fish-arena'}));
  await lock(page);await page.keyboard.press('Digit2');
  await page.mouse.down();await page.mouse.up();await ticks(page,6);
  expect((await state(page)).fish[0].hp).toBe(10);
  const first=(await state(page)).attack.hand;
  await page.mouse.down();await page.mouse.up();await ticks(page,12);
  expect((await state(page)).attack.hand).not.toBe(first);await ticks(page,10);
  expect((await state(page)).fish[0].state).toBe('groundedDead');
  expect((await state(page)).events.filter(e=>e.type==='fish_damage')).toHaveLength(2);
  await page.screenshot({path:test.info().outputPath('v2-alternate-fist-blood.png')});
});
test('v2 a real shore crossing emits the splash once, and the ripple freezes during pause',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'fish-arena',initial:{
    player:{position:{x:0,y:1,z:7},pitch:-.6},fish:[{id:'splash',species:'sprat',state:'groundedAlive',position:{x:0,y:1,z:9.5},jumpTimer:1.8}]
  }}));
  await ticks(page,20);const escaped=await state(page);
  expect(escaped.events.filter(e=>e.type==='fish_escape')).toHaveLength(1);
  expect(escaped.events.find(e=>e.type==='fish_escape')!.position).toBeDefined();
  await page.screenshot({path:test.info().outputPath('v2-water-splash.png')});
  await ticks(page,20);await page.screenshot({path:test.info().outputPath('v2-water-ripple.png')});
  await page.keyboard.press('Escape');const frozen=await state(page);await ticks(page,300);
  expect(await state(page)).toEqual(frozen);
});
