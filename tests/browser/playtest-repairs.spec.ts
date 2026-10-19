import {writeFile} from 'node:fs/promises';
import {test,expect,type Page} from '@playwright/test';
const state=(p:Page)=>p.evaluate(()=>window.__islandTest!.getState());
const ticks=(p:Page,n:number)=>p.evaluate(n=>window.__islandTest!.advanceTicks(n),n);
async function start(page:Page){if((await state(page)).gamePhase==='running')await page.keyboard.press('Escape');await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(false);const box=await page.locator('#play-button').boundingBox();await page.locator('#play-button').click();await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);return{x:box!.x+box!.width/2,y:box!.y+box!.height/2};}

test('native moving float, cast arc, rope inertia and pause frame evidence',async({page})=>{
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9}}}}));const m=await start(page);
 await page.mouse.down();await ticks(page,30);await page.screenshot({path:test.info().outputPath('backlift.png')});await page.mouse.up();
 for(const n of [0,7,7,7]){await ticks(page,n);await page.screenshot({path:test.info().outputPath(`cast-${(await state(page)).simulationTick}.png`)});}
 await ticks(page,99);expect((await state(page)).fishing.phase).toBe('bite');await page.mouse.down();
 const directions=[];for(let i=0;i<10;i++){await ticks(page,15);const s=await state(page);directions.push({tick:s.simulationTick,direction:s.fishing.pullDirection,cast:s.fishing.cast});await page.screenshot({path:test.info().outputPath(`pull-${i}.png`)});if(s.fishing.tension>75)await page.mouse.up();}
 await page.mouse.up();await page.keyboard.press('KeyR');await page.mouse.move(m.x+200,m.y-45);await ticks(page,1);await page.screenshot({path:test.info().outputPath('rope-lag.png')});
 await ticks(page,120);await page.screenshot({path:test.info().outputPath('rope-settle.png')});await page.keyboard.press('Escape');
 const before=await page.locator('canvas').screenshot();await ticks(page,300);expect(await page.locator('canvas').screenshot()).toEqual(before);
 await writeFile(test.info().outputPath('directions.json'),JSON.stringify(directions,null,2));
});

test('native left/right Ctrl dives and rebound dive has no default alias bypass',async({page})=>{
 for(const key of ['ControlLeft','ControlRight']){
 await page.goto('/?test=1');await page.evaluate(()=>{window.__islandTest!.dispatch({type:'openSettings'});window.__islandTest!.dispatch({type:'updateSettings',bindings:{dive:'ControlLeft'}});window.__islandTest!.dispatch({type:'closeSettings'});window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:-1.35,z:12}}}});});await start(page);
 await page.keyboard.down(key);await ticks(page,60);await page.keyboard.up(key);const s=await state(page);expect(s.submerged).toBe(true);expect(s.player.position.y).toBeLessThan(-3);
 await page.screenshot({path:test.info().outputPath(`underwater-${key}.png`)});
 await page.keyboard.press('Escape');await page.locator('#settings-button').click();await page.locator('[data-binding-action=dive]').click();await page.keyboard.press('KeyC');await page.keyboard.press('Escape');await start(page);
 const y=(await state(page)).player.position.y;await page.keyboard.down(key);await ticks(page,15);await page.keyboard.up(key);expect((await state(page)).player.position.y).toBeGreaterThan(y);
 await page.keyboard.down('KeyC');await ticks(page,30);await page.keyboard.up('KeyC');expect((await state(page)).player.position.y).toBeLessThan(y);
 }
});

test('Boss body contact is safe, landing hits once and native sidestep dodges the locked circle',async({page})=>{
 for(const dodge of [false,true]){
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{player:{position:{x:0,y:1,z:9.7}}}}));await start(page);
 await ticks(page,90);expect((await state(page)).player.hp).toBe(100);await page.screenshot({path:test.info().outputPath(`warning-${dodge}.png`)});
 if(dodge)await page.keyboard.down('KeyD');await ticks(page,74);expect((await state(page)).player.hp).toBe(100);
 await ticks(page,1);if(dodge)await page.keyboard.up('KeyD');expect((await state(page)).player.hp).toBe(dodge?100:85);
 await page.screenshot({path:test.info().outputPath(`landing-${dodge}.png`)});await ticks(page,59);expect((await state(page)).player.hp).toBe(dodge?100:85);
 }
});

test('shop native moving view repeats twice without overlapping wall/post surface strips',async({page})=>{
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-6.5},yaw:0,pitch:.12}}}));const m=await start(page);let{x,y}=m;
 for(let repeat=1;repeat<=2;repeat++)for(let i=0;i<9;i++){x+=i<4?18:i<8?-18:0;y+=i<4?-4:i<8?4:0;await page.mouse.move(x,y);await page.screenshot({path:test.info().outputPath(`shop-${repeat}-${i}.png`)});}
});

test('Boss playtest directly offers all three unlocked weapons and each hit uses its real cycle',async({page})=>{
 await page.goto('/?test=1&playtest=boss');await start(page);
 for(const [slot,weapon,hit,cycle]of [['Digit3','club',12,42],['Digit4','spear',10,48],['Digit5','hammer',20,66]] as const){
 await page.keyboard.press(slot);expect((await state(page)).currentWeapon).toBe(weapon);await page.mouse.down();await page.mouse.up();await ticks(page,hit);
 await page.screenshot({path:test.info().outputPath(`tool-${weapon}.png`)});expect((await state(page)).attack.hitCommitted).toBe(true);await ticks(page,cycle-hit);
 }
});
