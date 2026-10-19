import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';
declare global { interface Window { __islandTest?: IslandTest } }
const boss=(hp=600,tentacleRemaining=4,inkRemaining=3)=>({state:'active',hp,tentacleRemaining,inkRemaining});
const allWeapons=['fist','club','spear','hammer'];
async function state(page:import('@playwright/test').Page){return page.evaluate(()=>window.__islandTest!.getState());}
async function ticks(page:import('@playwright/test').Page,count:number){await page.evaluate(count=>window.__islandTest!.advanceTicks(count),count);}
async function lock(page:import('@playwright/test').Page){await page.keyboard.press('Escape');await page.getByRole('button',{name:'继续游戏',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);}
async function attack(page:import('@playwright/test').Page){await page.mouse.down();await page.mouse.up();}
async function walk(page:import('@playwright/test').Page,key:string,count:number){await page.keyboard.down(key);await ticks(page,count);await page.keyboard.up(key);}
async function lookDown(page:import('@playwright/test').Page){await page.mouse.move(640,360);const s=await state(page);await page.mouse.move(640-s.player.yaw/.002,360+(s.player.pitch+.9)/.002);}
async function land(page:import('@playwright/test').Page){
  await page.mouse.down();await page.mouse.up();await ticks(page,120);await page.mouse.down();
  for(let i=0;i<250 && (await state(page)).fishing.phase==='reeling';i++){
    const s=await state(page);if(s.fishing.tension>75) await page.mouse.up();else if(s.fishing.tension<40 && !s.fishing.holding) await page.mouse.down();await ticks(page,6);
  }await page.mouse.up();
}

test('native third golden reel triggers exactly one visible boss and keeps carried fish; broken reel never increments',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
  // Public legal RNG state for the next golden draw; success still needs all real reel controls.
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{rareCaughtCount:2,fishRngState:1584200935,player:{position:{x:0,y:1,z:9}}}}));
  await lock(page);await land(page);const s=await state(page);expect(s.rareCaughtCount).toBe(3);expect(s.boss.state).toBe('active');expect(s.fish[0].state).toBe('carried');expect(s.fish[0].species).toBe('golden');expect(s.events.filter(e=>e.type==='boss_spawn')).toHaveLength(1);
  await expect(page.locator('#rare-progress')).toContainText('3 / 3');await expect(page.locator('#boss-hud')).toBeVisible();await expect(page.locator('#boss-hp')).toHaveText('600 / 600');await expect(page.locator('#fishing-status')).toContainText('金鳞鱼');
  await page.screenshot({path:test.info().outputPath('third-golden-boss-1280.png')});await page.keyboard.press('KeyQ');await attack(page);await ticks(page,1);expect((await state(page)).boss.hp).toBe(590);expect((await state(page)).fish[0].state).toBe('carried');
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{rareCaughtCount:2,fishRngState:1584200935,player:{position:{x:0,y:1,z:9}}}}));
  await lock(page);await page.mouse.down();await page.mouse.up();await ticks(page,120);await page.mouse.down();await ticks(page,180);await page.mouse.up();
  const failed=await state(page);expect(failed.fishing.result).toBe('line-broken');expect(failed.rareCaughtCount).toBe(2);expect(failed.boss.state).toBe('locked');await expect(page.locator('#boss-hud')).toBeHidden();expect(errors).toEqual([]);
});

test('actual D movement dodges the locked tentacle circle, a stationary target loses fifteen once, and Esc freezes warning',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena'}));await lock(page);await ticks(page,240);
  await expect(page.locator('#boss-attack-status')).toContainText('触手预警 1.20');const warning=(await state(page)).boss.attacks[0];await lookDown(page);await page.screenshot({path:test.info().outputPath('tentacle-warning-1280.png')});await page.keyboard.press('Escape');const frozen=await state(page);await ticks(page,600);expect(await state(page)).toEqual(frozen);
  await page.getByRole('button',{name:'继续游戏',exact:true}).click();await walk(page,'KeyD',31);await ticks(page,41);let s=await state(page);expect(s.player.hp).toBe(100);expect(s.boss.attacks[0].position).toEqual(warning.position);expect(s.boss.attacks[0].phase).toBe('active');
  await page.screenshot({path:test.info().outputPath('tentacle-dodge-1280.png')});await walk(page,'KeyA',2);s=await state(page);expect(s.player.hp).toBe(85);await ticks(page,16);expect((await state(page)).player.hp).toBe(85);expect((await state(page)).boss.attacks).toHaveLength(0);
});

test('native club attacks reach exactly phase two at HP300; ink direction, speed, expiry and pause follow actual state',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});await page.goto('/?test=1');await page.evaluate(allWeapons=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{unlockedWeapons:allWeapons}}),allWeapons);await lock(page);await page.keyboard.press('KeyQ');await page.keyboard.press('Digit2');
  for(let i=0;i<12;i++){await attack(page);await ticks(page,1);if(i<11) await ticks(page,41);}
  let s=await state(page);expect(s.boss.hp).toBe(300);expect(s.boss.phase).toBe(2);expect(s.boss.inkRemaining).toBe(3);expect(s.events.filter(e=>e.type==='boss_damage')).toHaveLength(12);await expect(page.locator('#boss-phase')).toContainText('第二阶段');
  await page.screenshot({path:test.info().outputPath('boss-phase-two-1920.png')});
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{boss:{state:'active',hp:300,tentacleRemaining:4,inkRemaining:3}}}));await lock(page);await ticks(page,180);const ink=(await state(page)).boss.attacks.find(a=>a.type==='ink')!;
  await expect(page.locator('#boss-attack-status')).toContainText('墨汁预警 0.80');await page.screenshot({path:test.info().outputPath('ink-warning-1920.png')});await walk(page,'KeyD',31);await ticks(page,17);
  s=await state(page);expect(s.boss.attacks.find(a=>a.id===ink.id)!.phase).toBe('flying');await ticks(page,60);s=await state(page);const moved=s.boss.attacks.find(a=>a.id===ink.id)!;expect(moved.position.z).toBeCloseTo(6,6);expect(moved.remaining).toBe(4);expect(moved.direction).toEqual(ink.direction);expect(s.player.hp).toBe(100);
  await page.keyboard.press('Escape');const frozen=await state(page);await ticks(page,300);expect(await state(page)).toEqual(frozen);await page.getByRole('button',{name:'继续游戏',exact:true}).click();await ticks(page,240);expect((await state(page)).boss.attacks.some(a=>a.id===ink.id)).toBe(false);
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{boss:{state:'active',hp:300,tentacleRemaining:4,inkRemaining:3}}}));await lock(page);await ticks(page,259);expect((await state(page)).player.hp).toBe(90);await ticks(page,12);expect((await state(page)).player.hp).toBe(90);
});

test('victory UI freezes and releases pointer, real restart clears boss/count; simultaneous lethal tentacle takes death priority',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{boss:{state:'active',hp:65,tentacleRemaining:4,inkRemaining:3},unlockedWeapons:['hammer'],currentWeapon:'hammer'}}));await lock(page);await page.keyboard.press('KeyQ');await attack(page);await ticks(page,1);
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(false);await expect(page.locator('#menu-title')).toHaveText('通关成功');await expect(page.locator('#victory-stats')).toBeVisible();await expect(page.locator('#play-button')).toBeInViewport();
  let terminal=await state(page);expect(terminal.gamePhase).toBe('victory');expect(terminal.boss.state).toBe('defeated');expect(terminal.events.filter(e=>e.type==='victory')).toHaveLength(1);await ticks(page,600);expect(await state(page)).toEqual(terminal);await page.screenshot({path:test.info().outputPath('victory-1280.png')});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'重新开始',exact:true}).click();expect((await state(page)).rareCaughtCount).toBe(0);expect((await state(page)).boss.state).toBe('locked');await expect(page.locator('#boss-hud')).toBeHidden();expect((await state(page)).unlockedWeapons).toEqual(['fist']);
  await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{player:{hp:15},boss:{state:'active',hp:10,tentacleRemaining:1/60,inkRemaining:3}}}));await lock(page);await page.keyboard.press('KeyQ');await ticks(page,72);await attack(page);await ticks(page,1);
  await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(false);terminal=await state(page);expect(terminal.player.hp).toBe(0);expect(terminal.boss.hp).toBe(0);expect(terminal.gamePhase).toBe('dead');expect(terminal.events.filter(e=>e.type==='victory')).toHaveLength(0);await expect(page.locator('#menu-description')).toContainText('生命耗尽');await expect(page.locator('#victory-stats')).toBeHidden();await ticks(page,600);expect(await state(page)).toEqual(terminal);await page.screenshot({path:test.info().outputPath('simultaneous-death-1920.png')});expect(errors).toEqual([]);
});

test('native full 600 HP fight can dodge the first warning and defeat the boss with ten locked hammer swings',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
  await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{unlockedWeapons:['hammer'],currentWeapon:'hammer'}}));await lock(page);await page.keyboard.press('KeyQ');
  for(let i=0;i<10;i++) {
    await attack(page);await ticks(page,1);
    if(i===4) {
      expect((await state(page)).boss.attacks.some(a=>a.type==='tentacle'&&a.phase==='warning')).toBe(true);
      await walk(page,'KeyD',31);await ticks(page,34);expect((await state(page)).player.hp).toBe(100);await walk(page,'KeyA',31);
    } else if(i<9) await ticks(page,65);
  }
  const s=await state(page);expect(s.gamePhase).toBe('victory');expect(s.boss.hp).toBe(0);expect(s.stats.bossDamageDealt).toBe(600);expect(s.events.filter(e=>e.type==='boss_damage')).toHaveLength(10);expect(s.player.hp).toBeGreaterThan(0);
  await expect(page.locator('#menu-title')).toHaveText('通关成功');await page.screenshot({path:test.info().outputPath('full-boss-victory-1280.png')});expect(errors).toEqual([]);
});
