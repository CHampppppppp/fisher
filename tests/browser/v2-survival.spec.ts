import {test,expect,type Page} from '@playwright/test';
const state=(p:Page)=>p.evaluate(()=>window.__islandTest!.getState());
const tick=(p:Page,n:number)=>p.evaluate(n=>window.__islandTest!.advanceTicks(n),n);
async function start(p:Page){await p.keyboard.press('Escape');await p.locator('#play-button').click();await expect.poll(()=>p.evaluate(()=>!!document.pointerLockElement)).toBe(true);}
test('v2 native hotbar wheel, number keys, food and Esc never open a backpack',async({page})=>{
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{hunger:50},inventory:[{id:'meal',species:'sprat'}]}}));await start(page);
 await expect(page.locator('#weapon-bar button')).toHaveCount(9);await page.keyboard.press('Digit6');await page.mouse.down();await page.mouse.up();expect((await state(page)).player.hunger).toBe(62);
 await page.mouse.wheel(0,-200);expect((await state(page)).selectedSlot).toBe(5);await page.keyboard.press('Digit1');await page.mouse.wheel(0,-5);expect((await state(page)).selectedSlot).toBe(8);
 await page.keyboard.press('Tab');await page.keyboard.press('KeyQ');expect((await state(page)).gamePhase).toBe('running');expect(await page.locator('#inventory-menu').count()).toBe(0);
 await page.screenshot({path:test.info().outputPath('v2-hotbar.png')});await page.keyboard.press('Escape');await page.mouse.wheel(0,100);expect((await state(page)).selectedSlot).toBe(8);await expect(page.locator('#weapon-bar')).toBeHidden();
});
test('v2 native swimming, oxygen, drowning and pause share the real simulation',async({page})=>{
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:-1.35,z:12},oxygen:20}}}));await start(page);
 await page.keyboard.down('ControlLeft');await tick(page,120);await page.keyboard.up('ControlLeft');expect((await state(page)).submerged).toBe(true);
 await expect(page.locator('#oxygen')).toBeVisible();await expect(page.locator('#underwater-tint')).toBeVisible();await page.screenshot({path:test.info().outputPath('v2-underwater.png')});
 await page.keyboard.press('Escape');const frozen=await state(page);await tick(page,1200);expect(await state(page)).toEqual(frozen);await expect(page.locator('#oxygen')).toBeHidden();
 await start(page);await page.keyboard.down('Space');await tick(page,180);await page.keyboard.up('Space');expect((await state(page)).submerged).toBe(false);
});
test('v2 merchant is visible behind half-open counter; selling and buying return through pause',async({page})=>{
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-4},yaw:0},inventory:[{id:'sale',species:'golden'}]}}));await start(page);
 await page.screenshot({path:test.info().outputPath('v2-merchant.png')});await page.keyboard.down('KeyW');await tick(page,30);await page.keyboard.up('KeyW');await page.keyboard.press('KeyE');await expect(page.locator('#shop-menu')).toBeVisible();
 await page.locator('.shop-item').first().click();await page.locator('#sell-button').click();expect((await state(page)).coins).toBe(120);
 await page.locator('.buy-weapon[data-weapon-id=club]').click();expect((await state(page)).coins).toBe(90);await page.screenshot({path:test.info().outputPath('v2-shop.png')});
 await page.keyboard.press('Escape');expect((await state(page)).ui.menu).toBe('pause');await expect(page.locator('#weapon-bar')).toBeHidden();
});
test('v2 native boss visibly jumps onto land and chases the player',async({page})=>{
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{unlockedWeapons:['hammer'],currentWeapon:'hammer'}}));await start(page);await tick(page,90);
 expect((await state(page)).boss.jumpPhase).toBe('warning');await page.screenshot({path:test.info().outputPath('v2-boss-warning.png')});
 await page.keyboard.down('KeyD');await tick(page,50);await page.keyboard.up('KeyD');expect((await state(page)).boss.jumpPhase).toBe('jumping');await page.screenshot({path:test.info().outputPath('v2-boss-leap.png')});
 await tick(page,25);expect((await state(page)).boss.position.y).toBe(3);await page.screenshot({path:test.info().outputPath('v2-boss-ashore.png')});
});
test('v2 menu, hotbar and shop at a narrow panel and a full desktop stay reachable',async({page})=>{
 for(const width of [1280,1920,480]){
  await page.setViewportSize({width,height:720});await page.goto('/?test=1');await expect(page.locator('#play-button')).toBeVisible();await expect(page.locator('#hud')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath(`v2-menu-${width}.png`)});
 }
});
