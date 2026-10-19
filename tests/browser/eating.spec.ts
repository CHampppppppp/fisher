import { test, expect, type Page } from '@playwright/test';
const state=(p:Page)=>p.evaluate(()=>window.__islandTest!.getState());
const tick=(p:Page,n:number)=>p.evaluate(n=>window.__islandTest!.advanceTicks(n),n);
async function start(page:Page) {
  if((await state(page)).gamePhase==='running')await page.keyboard.press('Escape');
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(false);
  await page.locator('#play-button').click();
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
}
async function prepare(page:Page,url='/?test=1') {
  await page.goto(url);await page.waitForFunction(()=>Boolean(window.__islandTest));
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{
    player:{hunger:50},inventory:[{id:'meal',species:'sprat'},{id:'next',species:'sprat'}],selectedSlot:5,
  }}));await start(page);
}
for(const width of [1280,1920])test(`native eating shows progress and commits after 120 ticks at ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===1280?720:1080});await prepare(page);
  await expect(page.locator('#weapon-feedback')).toHaveText('按住左键 2 秒食用');
  await page.keyboard.down('KeyW');await page.mouse.down();await tick(page,60);
  await expect(page.locator('#eating-info')).toBeVisible();
  await expect(page.locator('#eating-progress')).toHaveJSProperty('value',60);
  await page.screenshot({path:test.info().outputPath('eating-half.png')});
  await tick(page,59);expect((await state(page)).inventory).toHaveLength(2);
  expect((await state(page)).consumedFish).toHaveLength(0);
  await tick(page,1);let s=await state(page);expect(s.consumedFish[0].consumedTick).toBe(120);
  expect(s.player.position.z).toBeCloseTo(8,5);expect(s.player.hunger).toBeCloseTo(61.8,5);
  await page.keyboard.up('KeyW');await tick(page,120);expect((await state(page)).consumedFish).toHaveLength(1);
  await page.mouse.up();await page.mouse.down();await tick(page,60);await page.mouse.up();
  s=await state(page);expect(s.eating.fishId).toBeNull();expect(s.inventory).toHaveLength(1);
  await expect(page.locator('#eating-info')).toBeHidden();await tick(page,120);expect((await state(page)).inventory).toHaveLength(1);
  await page.mouse.down();await tick(page,60);await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.locator('#eating-info')).toBeHidden();await tick(page,600);await start(page);
  await tick(page,120);expect((await state(page)).consumedFish).toHaveLength(1);
  await page.mouse.down();await tick(page,120);await page.mouse.up();expect((await state(page)).inventory).toHaveLength(0);
  await page.screenshot({path:test.info().outputPath('eating-complete.png')});
});

test('real production clock spends two seconds chewing and release cancels',async({page})=>{
  await prepare(page,'/?test=1&clock=real');
  await page.mouse.down();await expect(page.locator('#eating-info')).toBeVisible();
  await page.waitForTimeout(250);expect((await state(page)).consumedFish).toHaveLength(0);
  await page.mouse.up();await expect(page.locator('#eating-info')).toBeHidden();
  await page.waitForTimeout(2100);expect((await state(page)).inventory).toHaveLength(2);
  await page.mouse.down();const begun=await state(page);const startTick=begun.simulationTick-begun.eating.elapsedTicks;
  await expect.poll(async()=>(await state(page)).consumedFish.length,{timeout:5000}).toBe(1);
  const complete=await state(page);expect(complete.consumedFish[0].consumedTick-startTick).toBe(120);
  await page.mouse.up();
});
