import { test, expect, type Page } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';
import type { SaveFile } from '../../src/game/save-format.ts';
declare global { interface Window { __islandTest?: IslandTest; restoreSavePut?:()=>void } }
const apiState=(page:Page)=>page.evaluate(()=>window.__islandTest!.getState());
const ticks=(page:Page,count:number)=>page.evaluate(count=>window.__islandTest!.advanceTicks(count),count);
const exportSave=(page:Page)=>page.evaluate(()=>window.__islandTest!.exportSave());
async function rawSlot(page:Page):Promise<SaveFile|undefined>{return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('island-fishing-survival',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
    const db=request.result;const tx=db.transaction('saves','readonly');const get=tx.objectStore('saves').get('current');let value:unknown;
    get.onsuccess=()=>{value=get.result;};tx.oncomplete=()=>{db.close();resolve(value);};tx.onabort=()=>{db.close();reject(tx.error);};
  };
})) as Promise<SaveFile|undefined>;}
async function lock(page:Page){await page.getByRole('button',{name:'继续游戏',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);}
async function pause(page:Page){await page.keyboard.press('Escape');await expect(page.locator('#menu')).toBeVisible();}
async function saveButton(page:Page){await page.getByRole('button',{name:'保存游戏',exact:true}).click();await expect(page.locator('.storage-status:visible')).toContainText('已保存');}
async function loadButton(page:Page){await page.getByRole('button',{name:'读取存档',exact:true}).click();await expect(page.locator('#menu .storage-status')).toContainText('已读取');}
async function attack(page:Page){await page.mouse.down();await page.mouse.up();}
async function land(page:Page){await attack(page);await ticks(page,120);await page.mouse.down();for(let i=0;i<250&&(await apiState(page)).fishing.phase==='reeling';i++){
  const s=await apiState(page);if(s.fishing.tension>75)await page.mouse.up();else if(s.fishing.tension<40&&!s.fishing.holding)await page.mouse.down();await ticks(page,6);
}await page.mouse.up();}

test('normal inventory save commits a complete tick into real IndexedDB; refresh and native load restore mixed entities paused',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');
  await page.evaluate(()=>window.__islandTest!.reset({seed:13320,fixture:'boss-arena',initial:{coins:47,unlockedWeapons:['club','spear'],currentWeapon:'spear',player:{hp:83,hunger:65},inventory:[{id:'bag',species:'tuna'}],fish:[{id:'hand',species:'golden',state:'carried',position:{x:0,y:1,z:0},jumpTimer:0},{id:'live',species:'bass',state:'groundedAlive',position:{x:3,y:1,z:3},jumpTimer:1.3},{id:'corpse',species:'sprat',state:'groundedDead',position:{x:4,y:1,z:4},jumpTimer:0,hp:0}],boss:{state:'active',hp:300,tentacleRemaining:.05,inkRemaining:.1}}}));
  await ticks(page,17);const before=await apiState(page);expect(before.fish.find(f=>f.id==='live')!.jumpPhase).toBe('jumping');expect(before.boss.attacks).toHaveLength(2);
  await page.keyboard.press('Tab');await saveButton(page);const saved=await rawSlot(page);expect(saved!.state.simulationTick).toBe(17);expect(saved!.state.gamePhase).toBe('running');expect(saved!.state.fish).toEqual(before.fish);expect(saved!.state.boss).toEqual(before.boss);
  await page.reload();await page.waitForTimeout(350);await loadButton(page);const restored=await apiState(page);
  for(const key of ['simulationTick','player','coins','unlockedWeapons','currentWeapon','fish','inventory','boss','rareCaughtCount','fishRngState'] as const)expect(restored[key]).toEqual(before[key]);
  expect(restored.gamePhase).toBe('paused');expect(restored.ui.menu).toBe('pause');expect(restored.events).toEqual([]);await expect(page.locator('#inventory-menu')).toBeHidden();await expect(page.locator('#coins-value')).toHaveText('47');await expect(page.locator('#hp-value')).toHaveText('83');
  await ticks(page,600);expect(await apiState(page)).toEqual(restored);await page.screenshot({path:test.info().outputPath('save-loaded-1280.png')});await lock(page);await ticks(page,1);expect((await apiState(page)).simulationTick).toBe(18);expect(errors).toEqual([]);
});

test('save after hammer animation keeps remaining cooldown and airborne velocity through real refresh/load and explicit continue',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{unlockedWeapons:['hammer'],currentWeapon:'hammer'}}));await pause(page);await lock(page);await page.keyboard.press('KeyQ');await attack(page);await ticks(page,46);await page.keyboard.press('Space');await ticks(page,5);expect((await apiState(page)).player.position.y).toBeGreaterThan(1);
  await pause(page);await saveButton(page);const saved=await rawSlot(page);expect(saved!.state.attackCooldownRemaining).toBe(.25);expect(saved!.runtime.velocityY).toBeCloseTo(3.5,8);
  await page.reload();await page.waitForTimeout(300);await loadButton(page);const restored=await apiState(page);expect(restored.attackCooldownRemaining).toBe(.25);expect(restored.player.position).toEqual(saved!.state.player.position);await lock(page);await attack(page);expect((await apiState(page)).lastAction.accepted).toBe(false);
  await ticks(page,14);await attack(page);expect((await apiState(page)).lastAction.accepted).toBe(false);await ticks(page,1);await attack(page);expect((await apiState(page)).lastAction.accepted).toBe(true);expect((await apiState(page)).attack.weaponId).toBe('hammer');
});

test('real third golden capture saves and loads repeatedly with one boss; native sale consumes the original corpse once',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{rareCaughtCount:2,fishRngState:1584200935,player:{position:{x:0,y:1,z:9}},inventory:[{id:'sale',species:'bass'}]}}));await pause(page);await lock(page);await land(page);expect((await apiState(page)).rareCaughtCount).toBe(3);expect((await apiState(page)).events.filter(e=>e.type==='boss_spawn')).toHaveLength(1);await pause(page);await saveButton(page);
  for(let i=0;i<2;i++){await loadButton(page);const s=await apiState(page);expect(s.rareCaughtCount).toBe(3);expect(s.boss.state).toBe('active');expect(s.fish.filter(f=>f.state==='carried')).toHaveLength(1);expect(s.events).toEqual([]);}
  await lock(page);await page.keyboard.down('KeyS');await ticks(page,165);await page.keyboard.up('KeyS');await page.keyboard.down('KeyA');await ticks(page,90);await page.keyboard.up('KeyA');await page.keyboard.press('KeyE');await expect(page.locator('#shop-menu')).toBeVisible();await page.locator('#shop-list button').click();await page.getByRole('button',{name:'出售所选鱼',exact:true}).click();expect((await apiState(page)).coins).toBe(20);await expect(page.locator('#sell-button')).toBeDisabled();await saveButton(page);
  await page.reload();await loadButton(page);const s=await apiState(page);expect(s.rareCaughtCount).toBe(3);expect(s.coins).toBe(20);expect(s.terminalFish.filter(f=>f.id==='sale')).toHaveLength(1);expect(s.inventory).toHaveLength(0);await lock(page);await page.keyboard.press('KeyE');expect((await page.evaluate(()=>window.__islandTest!.dispatch({type:'sell',fishId:'sale'}))).accepted).toBe(false);expect((await apiState(page)).coins).toBe(20);
});

test('shared import validation rejects corrupt data without touching live state or the actual old slot',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{coins:18,inventory:[{id:'unique',species:'bass'}]}}));await pause(page);await saveButton(page);const baseline=await apiState(page);const old=await rawSlot(page);
  const results=await page.evaluate(async()=>{
    const api=window.__islandTest!;const valid=await api.exportSave();const bad:unknown[]=[{version:99,state:valid.state,runtime:valid.runtime},{version:1},{...valid,state:{...valid.state,coins:-1}},{...valid,state:{...valid.state,boss:{...valid.state.boss,state:'locked'}}},{...valid,state:{...valid.state,inventory:[...valid.state.inventory,...valid.state.inventory]}},{...valid,state:{...valid.state,player:{...valid.state.player,pitch:2}}}];
    const results=[];for(const value of bad){results.push({result:await api.importSave(value),state:await api.getState()});}return results;
  });for(const result of results){expect(result.result.ok).toBe(false);expect(result.result.error).toBeTruthy();expect(result.state).toEqual(baseline);}expect(await rawSlot(page)).toEqual(old);await expect(page.locator('#menu .storage-status')).toContainText('导入失败');await page.screenshot({path:test.info().outputPath('import-failure-1280.png')});expect(errors).toEqual([]);
  const valid=await exportSave(page);valid.state.coins=31;expect((await page.evaluate(value=>window.__islandTest!.importSave(value),valid)).ok).toBe(true);expect((await apiState(page)).coins).toBe(31);expect(await rawSlot(page)).toEqual(old);await loadButton(page);expect((await apiState(page)).coins).toBe(18);
});

test('nonidle fishing save refuses; aborting a real put transaction after request success reports failure and keeps the old complete save',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{coins:17,player:{position:{x:0,y:1,z:9}}}}));await pause(page);await saveButton(page);const old=await rawSlot(page);await lock(page);await attack(page);await ticks(page,120);await page.mouse.down();await ticks(page,30);await page.mouse.up();await pause(page);await page.getByRole('button',{name:'保存游戏',exact:true}).click();await expect(page.locator('#menu .storage-status')).toContainText('请先完成或取消钓鱼');expect(await rawSlot(page)).toEqual(old);
  await page.evaluate(()=>window.__islandTest!.reset({seed:2,fixture:'shore',initial:{coins:99}}));await pause(page);
  await page.evaluate(()=>{
    const original=IDBObjectStore.prototype.put;window.restoreSavePut=()=>{IDBObjectStore.prototype.put=original;};
    IDBObjectStore.prototype.put=function(...args:Parameters<IDBObjectStore['put']>){const request=original.apply(this,args);request.addEventListener('success',()=>this.transaction.abort(),{once:true});return request;};
  });await page.getByRole('button',{name:'保存游戏',exact:true}).click();await expect(page.locator('#menu .storage-status')).toContainText('保存失败');expect((await apiState(page)).lastAction.accepted).toBe(false);expect((await apiState(page)).coins).toBe(99);await page.evaluate(()=>window.restoreSavePut!());expect(await rawSlot(page)).toEqual(old);await loadButton(page);expect((await apiState(page)).coins).toBe(17);expect((await apiState(page)).seed).toBe(1);expect(errors).toEqual([]);
});

test('native confirmed restart and test reset keep old slot; only a later explicit save replaces it',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{coins:43,fish:[{id:'keep',species:'golden',state:'carried',position:{x:0,y:1,z:0},jumpTimer:0}]}}));await page.keyboard.press('Tab');await saveButton(page);const old=await rawSlot(page);await page.locator('#close-inventory').click();page.once('dialog',d=>d.accept());await page.locator('#pause-restart').click();const fresh=await apiState(page);expect(fresh.coins).toBe(0);expect(fresh.fish).toHaveLength(0);expect(fresh.rareCaughtCount).toBe(0);expect(await rawSlot(page)).toEqual(old);await pause(page);await loadButton(page);expect((await apiState(page)).coins).toBe(43);expect((await apiState(page)).fish[0].id).toBe('keep');
  await page.evaluate(()=>window.__islandTest!.reset({seed:9,fixture:'shore',initial:{coins:9}}));expect(await rawSlot(page)).toEqual(old);await pause(page);await saveButton(page);expect((await rawSlot(page))!.state.coins).toBe(9);await page.reload();await loadButton(page);expect((await apiState(page)).coins).toBe(9);
});

test('normal terminal save/load feedback preserves dead or victory without replaying reward events, with 1920 controls in view',async({page})=>{
  await page.setViewportSize({width:1920,height:1080});await page.goto('/?test=1');for(const hp of [0,100]){
    await page.evaluate(hp=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{player:{hp},boss:{state:'defeated',hp:0,tentacleRemaining:4,inkRemaining:3}}}),hp);await saveButton(page);const before=await apiState(page);await loadButton(page);const s=await apiState(page);expect(s.gamePhase).toBe(before.gamePhase);expect(s.events).toHaveLength(0);await ticks(page,600);expect((await apiState(page)).simulationTick).toBe(0);await expect(page.getByRole('button',{name:'读取存档',exact:true})).toBeInViewport();
  }await page.screenshot({path:test.info().outputPath('terminal-save-1920.png')});
});

test('a real flying ink projectile survives save and refresh with exact position, direction and lifetime, without offline advancement',async({page})=>{
  await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{boss:{state:'active',hp:300,tentacleRemaining:4,inkRemaining:0}}}));await pause(page);await lock(page);await page.keyboard.down('KeyD');await ticks(page,31);await page.keyboard.up('KeyD');await ticks(page,78);const before=await apiState(page);const ink=before.boss.attacks.find(a=>a.type==='ink'&&a.phase==='flying')!;expect(ink.remaining).toBe(4);expect(Math.hypot(ink.position.x,ink.position.y-1.9,ink.position.z-12)).toBeCloseTo(6,8);await pause(page);await saveButton(page);
  await page.reload();await page.waitForTimeout(1000);await loadButton(page);const restored=await apiState(page);expect(restored.boss).toEqual(before.boss);expect(restored.simulationTick).toBe(109);await ticks(page,600);expect((await apiState(page)).boss).toEqual(before.boss);await lock(page);await ticks(page,60);const flying=(await apiState(page)).boss.attacks.find(a=>a.id===ink.id)!;expect(flying.remaining).toBe(3);for(const axis of ['x','y','z'] as const)expect(flying.position[axis]).toBeCloseTo(ink.position[axis]+ink.direction[axis]*6,8);expect(flying.direction).toEqual(ink.direction);
});

test('ordinary URL offers real saved-game recovery with no test adapter, and only explicit continue resumes its clock',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:71,fixture:'shore',initial:{coins:26,player:{hp:82,hunger:67}}}));await ticks(page,30);await pause(page);await saveButton(page);const old=await rawSlot(page);
  await page.goto('/');expect(await page.evaluate(()=>Object.hasOwn(window,'__islandTest'))).toBe(false);await loadButton(page);await expect(page.locator('#coins-value')).toHaveText('26');await expect(page.locator('#hp-value')).toHaveText('82');await expect(page.getByRole('button',{name:'继续游戏',exact:true})).toBeInViewport();await page.waitForTimeout(350);await saveButton(page);expect((await rawSlot(page))!.state.simulationTick).toBe(old!.state.simulationTick);await page.screenshot({path:test.info().outputPath('ordinary-recovery-1280.png')});await lock(page);await page.waitForTimeout(200);await pause(page);await saveButton(page);expect((await rawSlot(page))!.state.simulationTick).toBeGreaterThan(old!.state.simulationTick);expect(errors).toEqual([]);
});

test('a real lethal attack can be saved as a terminal record; victory and simultaneous death reload without replay or continued simulation',async({page})=>{
  await page.goto('/?test=1');for(const simultaneous of [false,true]){
    await page.evaluate(simultaneous=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{player:{hp:simultaneous?15:100},boss:{state:'active',hp:10,tentacleRemaining:simultaneous?1/60:4,inkRemaining:3}}}),simultaneous);await pause(page);await lock(page);await page.keyboard.press('KeyQ');if(simultaneous)await ticks(page,72);await attack(page);await ticks(page,1);const phase=simultaneous?'dead':'victory';expect((await apiState(page)).gamePhase).toBe(phase);await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(false);await saveButton(page);const old=await rawSlot(page);expect(old!.state.stats.bossDamageDealt).toBe(10);await page.reload();await loadButton(page);const s=await apiState(page);expect(s.gamePhase).toBe(phase);expect(s.boss.state).toBe('defeated');expect(s.player.hp).toBe(simultaneous?0:100);expect(s.events).toEqual([]);expect(s.stats.bossDamageDealt).toBe(10);await ticks(page,600);expect((await apiState(page)).simulationTick).toBe(old!.state.simulationTick);
  }
});
