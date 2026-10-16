import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';
declare global { interface Window { __islandTest?: IslandTest; __weaponAudio?: number[] } }
const allWeapons=['fist','club','spear','hammer'];
async function state(page: import('@playwright/test').Page) { return page.evaluate(()=>window.__islandTest!.getState()); }
async function ticks(page: import('@playwright/test').Page,count:number) { await page.evaluate(count=>window.__islandTest!.advanceTicks(count),count); }
async function lock(page: import('@playwright/test').Page) {
  await page.keyboard.press('Escape'); await page.getByRole('button',{name:'继续探索',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
}
async function clickAttack(page: import('@playwright/test').Page) { await page.mouse.down(); await page.mouse.up(); }
async function walk(page: import('@playwright/test').Page,key:string,count:number) { await page.keyboard.down(key); await ticks(page,count); await page.keyboard.up(key); }
async function look(page: import('@playwright/test').Page,yaw:number,pitch=0) {
  await page.mouse.move(640,360); const before=await state(page);
  await page.mouse.move(640+(yaw-before.player.yaw)/.002,360+(before.player.pitch-pitch)/.002);
  const after=await state(page); expect(after.player.yaw).toBeCloseTo(yaw,2); expect(after.player.pitch).toBeCloseTo(pitch,2);
}
async function catchFish(page: import('@playwright/test').Page) {
  await page.mouse.down(); await ticks(page,30); await page.mouse.up(); await ticks(page,120); await page.mouse.down();
  for(let i=0;i<250 && (await state(page)).fishing.phase==='reeling';i++) {
    const s=await state(page); if(s.fishing.tension>75) await page.mouse.up(); else if(s.fishing.tension<40 && !s.fishing.holding) await page.mouse.down();
    await ticks(page,6);
  }
  await page.mouse.up(); const caught=await state(page); expect(caught.fish.some(f=>f.state==='carried')).toBe(true); return caught.fish.find(f=>f.state==='carried')!;
}

test('shop UI sells bass then buys once; insufficient funds feedback and backpack equip agree with the real state',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-2}},coins:20,inventory:[{id:'trade-1',species:'bass'}]}}));
  await lock(page);await page.keyboard.press('KeyE');await page.locator('.shop-item').click();await page.locator('#sell-button').click();
  await expect(page.locator('#shop-balance')).toHaveText('金币 40');await page.locator('.buy-weapon[data-weapon-id=club]').click();
  let s=await state(page);expect(s.coins).toBe(10);expect(s.unlockedWeapons).toEqual(['fist','club']);expect(s.currentWeapon).toBe('fist');expect(s.events.filter(e=>e.type==='buy')).toHaveLength(1);
  await expect(page.locator('.buy-weapon[data-weapon-id=club]')).toBeDisabled();await expect(page.locator('#shop-status')).toContainText('已购买木棍');
  await page.locator('.buy-weapon[data-weapon-id=spear]').click();await expect(page.locator('#shop-status')).toContainText('金币不足');expect((await state(page)).coins).toBe(10);
  for(const selector of ['#close-shop','#sell-button','.buy-weapon[data-weapon-id=hammer]']) await expect(page.locator(selector)).toBeInViewport();
  await page.screenshot({path:test.info().outputPath('weapon-shop-1280.png')});
  await page.locator('#close-shop').click();await page.locator('#inventory-button').click();await page.locator('#inventory-weapons [data-weapon-id=club]').click();
  s=await state(page);expect(s.currentWeapon).toBe('club');await expect(page.locator('#inventory-weapons [data-weapon-id=club]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#inventory-weapons [data-weapon-id=hammer]')).toBeDisabled();await page.locator('#close-inventory').click();await page.locator('#mode-button').click();
  await expect(page.locator('#fishing-status')).toContainText('木棍');await expect(page.locator('#fishing-help')).toContainText('伤害 25');
  expect(errors).toEqual([]);
});

test('native quickkeys drive four real attacks with distinct synthesized cues; switching preserves the old weapon action and cooldown',async({page})=>{
  await page.addInitScript(()=>{
    window.__weaponAudio=[];const Original=window.AudioContext;
    window.AudioContext=class extends Original {
      createOscillator(){const osc=super.createOscillator();const set=osc.frequency.setValueAtTime.bind(osc.frequency);
        osc.frequency.setValueAtTime=(value,time)=>{window.__weaponAudio!.push(value);return set(value,time);};return osc;}
    };
  });await page.setViewportSize({width:1920,height:1080});await page.goto('/?test=1');
  for(const [i,id,damage,cooldown,knockback,swing,impact,animationTicks] of [[1,'fist',10,27,.1,100,180,6],[2,'club',25,42,.5,220,130,12],[3,'spear',40,48,.25,520,420,8],[4,'hammer',65,66,1.2,55,65,24]] as const) {
    await page.evaluate(allWeapons=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{unlockedWeapons:allWeapons,fish:[{id:'target',species:'golden',state:'groundedAlive',position:{x:0,y:1,z:1.5},jumpTimer:0}]}}),allWeapons);
    await lock(page);await page.keyboard.press(`Digit${i}`);await page.keyboard.press('KeyQ');await page.mouse.down();
    let s=await state(page);expect(s.currentWeapon).toBe(id);expect(s.attack.weaponId).toBe(id);expect(s.fish[0].hp).toBe(150-damage);expect(s.fish[0].position.z).toBeCloseTo(1.5+knockback,6);expect(s.attackCooldownRemaining).toBeCloseTo(cooldown/60,6);
    expect((await page.evaluate(()=>window.__weaponAudio)).slice(-2)).toEqual([swing,impact]);await ticks(page,animationTicks);
    await expect(page.locator('#attack-feedback')).toContainText(`伤害 ${damage}`);await expect(page.locator('#fishing-help')).toContainText(id==='spear'?'3.2 m':'2 m');
    await page.screenshot({path:test.info().outputPath(`weapon-${id}-1920.png`)});
    await page.keyboard.press('Digit1');expect((await state(page)).attack.weaponId).toBe(id);expect((await state(page)).attackCooldownRemaining).toBeCloseTo((cooldown-animationTicks)/60,6);
    await ticks(page,cooldown-animationTicks);await page.mouse.up();s=await state(page);expect(s.attack.sequence).toBe(1);expect(s.events.filter(e=>e.type==='fish_damage')).toHaveLength(1);
    await clickAttack(page);expect((await state(page)).attack.sequence).toBe(2);
  }
});

test('hammer cannot bypass cooldown by switching or menu; spear-only reach is reflected by native attacks',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(allWeapons=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{unlockedWeapons:allWeapons}}),allWeapons);
  await lock(page);await page.keyboard.press('KeyQ');await page.keyboard.press('Digit4');await clickAttack(page);await page.keyboard.press('Digit1');
  await clickAttack(page);expect((await state(page)).lastAction.reason).toBe('attack-cooldown');await page.keyboard.press('Tab');
  const frozen=await state(page);await ticks(page,300);expect(await state(page)).toEqual(frozen);await page.locator('#inventory-weapons [data-weapon-id=spear]').click();
  expect((await state(page)).attackCooldownRemaining).toBe(1.1);await page.locator('#close-inventory').click();await page.locator('#world').click({position:{x:640,y:360}});
  await ticks(page,65);await clickAttack(page);expect((await state(page)).lastAction.reason).toBe('attack-cooldown');await ticks(page,1);await clickAttack(page);expect((await state(page)).attack.weaponId).toBe('spear');
  for(const [key,hit] of [['Digit2',false],['Digit3',true]] as const) {
    await page.evaluate(allWeapons=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{unlockedWeapons:allWeapons,fish:[{id:'range',species:'golden',state:'groundedAlive',position:{x:0,y:1,z:2.8},jumpTimer:0}]}}),allWeapons);
    await lock(page);await page.keyboard.press('KeyQ');await page.keyboard.press(key);await clickAttack(page);expect((await state(page)).fish[0].hp).toBe(hit?110:150);
  }
});

test('normal UI loop catches, places, kills, picks up, sells, purchases, equips and kills again without editing coins or entities',async({page})=>{
  test.setTimeout(90000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
  // The adapter only initializes an empty zero-coin scene and advances the real fixed clock. All gameplay below uses native input.
  await page.evaluate(()=>window.__islandTest!.reset({seed:13320,fixture:'shore',initial:{player:{position:{x:0,y:1,z:-5},yaw:Math.PI}}}));await lock(page);
  const first=await catchFish(page);expect(first.species).toBe('tuna');expect((await state(page)).coins).toBe(0);
  await look(page,0,-.4);await page.keyboard.press('KeyE');expect((await state(page)).fish[0].state).toBe('groundedAlive');await page.keyboard.press('KeyQ');
  for(let i=0;i<15 && (await state(page)).fish[0].state==='groundedAlive';i++) {
    // Chase with native mouse/W after knockback and hopping; never move the entity or inject a hit.
    const s=await state(page);const fish=s.fish[0];const dx=fish.position.x-s.player.position.x;const dz=fish.position.z-s.player.position.z;
    await look(page,Math.atan2(dx,dz),-.4);
    const distance=Math.hypot(dx,dz);if(distance>1.4) await walk(page,'KeyW',Math.ceil((distance-1.4)*15));
    await clickAttack(page);if((await state(page)).fish[0]?.state==='groundedAlive') await ticks(page,27);
  }
  expect((await state(page)).events.filter(e=>e.type==='fish_damage')).toHaveLength(9);
  expect((await state(page)).fish[0].state).toBe('groundedDead');await page.keyboard.press('KeyE');expect((await state(page)).inventory[0].id).toBe(first.id);
  await look(page,0,0);await walk(page,'KeyA',90);await walk(page,'KeyW',45);await page.keyboard.press('KeyE');await expect(page.locator('#shop-menu')).toBeVisible();
  await page.locator('.shop-item').click();await page.locator('#sell-button').click();expect((await state(page)).coins).toBe(45);
  await page.locator('.buy-weapon[data-weapon-id=club]').click();expect((await state(page)).coins).toBe(15);await page.locator('#close-shop').click();await page.keyboard.press('Digit2');
  expect((await state(page)).currentWeapon).toBe('club');await page.locator('#world').click({position:{x:640,y:360}});await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
  await look(page,0,0);await walk(page,'KeyS',45);await walk(page,'KeyD',90);await look(page,Math.PI,0);await page.keyboard.press('KeyQ');
  const second=await catchFish(page);expect(second.species).toBe('sprat');await look(page,0,-.4);await page.keyboard.press('KeyE');await page.keyboard.press('KeyQ');await clickAttack(page);
  const final=await state(page);expect(final.fish.find(f=>f.id===second.id)!.state).toBe('groundedDead');expect(final.currentWeapon).toBe('club');expect(final.coins).toBe(15);
  expect(final.events.filter(e=>e.type==='landing')).toHaveLength(2);expect(final.events.filter(e=>e.type==='buy')).toHaveLength(1);expect(final.events.filter(e=>e.type==='sell')).toHaveLength(1);expect(final.events.filter(e=>e.type==='fish_death')).toHaveLength(2);
  await expect(page.locator('#attack-feedback')).toContainText('木棍击杀');await page.screenshot({path:test.info().outputPath('economic-combat-loop-1280.png')});expect(errors).toEqual([]);
});
