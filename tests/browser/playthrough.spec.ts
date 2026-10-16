import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import type {IslandTest} from '../../src/testing/test-api.ts';
import type {GameState} from '../../src/game/types.ts';
declare global {interface Window {__islandTest?:IslandTest}}
test.use({video:'on'});

// One public seed/shore preparation; all subsequent actions are native keys/mouse,
// real browser time, and real UI buttons. State reads only observe the production game.
test('real-clock native keyboard and mouse complete fishing, chase, food, sales, purchases, boss, storage and victory',async({page})=>{
  test.setTimeout(360000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const log:unknown[]=[];Object.assign(window,{__nativeInputLog:log});for(const type of ['mousedown','mouseup','blur','pointerlockchange'])document.addEventListener(type,event=>{log.push({type,trusted:event.isTrusted,target:(event.target as HTMLElement).id,locked:document.pointerLockElement?.id??null,time:performance.now()});if(log.length>10000)log.shift();},true);});
  const evidence:{name:string;state:GameState}[]=[];
  const read=()=>page.evaluate(()=>window.__islandTest!.getState());
  const note=async(name:string)=>{const s=await read();evidence.push({name,state:s});console.log(name,JSON.stringify({tick:s.simulationTick,hp:s.player.hp,coins:s.coins,caught:s.stats.caught,boss:s.boss.hp}));};
  let mx=(page.viewportSize()?.width??1280)/2,my=(page.viewportSize()?.height??720)/2;
  const wrap=(v:number)=>Math.atan2(Math.sin(v),Math.cos(v));
  async function aim(yaw:number,pitch=-.35){
    for(let attempt=0;attempt<6;attempt++){
      const s=await read();const scale=.002*s.settings.sensitivity;
      const dx=wrap(yaw-s.player.yaw),dy=s.player.pitch-pitch;
      if(Math.abs(dx)<.003&&Math.abs(dy)<.003)return;
      mx+=dx/scale;my+=dy/scale;await page.mouse.move(mx,my);
      // Native mouse dispatch and the DOM handler can be delivered on different turns.
      // Observe the actual camera before steering again; never write game look state.
      await page.waitForTimeout(15);
    }
    const s=await read();expect(Math.abs(wrap(yaw-s.player.yaw))).toBeLessThan(.01);expect(Math.abs(pitch-s.player.pitch)).toBeLessThan(.01);
  }
  async function ensureLock(){
    if(await page.evaluate(()=>Boolean(document.pointerLockElement)))return;
    const size=page.viewportSize()!;await page.locator('#world').click({position:{x:size.width/2,y:size.height/2}});
    await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
    mx=page.viewportSize()!.width/2;my=page.viewportSize()!.height/2;await page.mouse.move(mx,my);await page.waitForTimeout(15);
  }
  async function walk(x:number,z:number,sprint=false){
    await ensureLock();const start=Date.now();let held=false;
    if(sprint)await page.keyboard.down('ShiftLeft');
    try{
      for(;;){const s=await read();expect(s.gamePhase).toBe('running');const p=s.player.position;
        if(Math.hypot(x-p.x,z-p.z)<.2)break;
        if(Date.now()-start>12000)throw new Error(`Walk stuck toward ${x},${z} at ${JSON.stringify(p)}`);
        const near=Math.hypot(x-p.x,z-p.z)<1.2;
        if(near&&held){await page.keyboard.up('KeyW');held=false;}
        await aim(Math.atan2(x-p.x,z-p.z));
        if(!held){await page.keyboard.down('KeyW');held=true;}
        await page.waitForTimeout(near?40:25);
        if(near){await page.keyboard.up('KeyW');held=false;}
      }
    }finally{await page.keyboard.up('KeyW');if(sprint)await page.keyboard.up('ShiftLeft');}
  }
  async function mode(value:'fishing'|'combat'){
    if((await read()).mode!==value)await page.keyboard.press('KeyQ');
    expect((await read()).mode).toBe(value);
  }
  async function catchFish(species:string){
    await walk(0,-5);await mode('fishing');await aim(Math.PI,0);
    await page.mouse.down();await page.waitForTimeout(500);await page.mouse.up();
    await expect.poll(async()=>(await read()).fishing.phase,{timeout:5000,intervals:[30]}).toBe('bite');
    await page.mouse.down();expect((await read()).fishing.holding).toBe(true);let screenshot=false;const start=Date.now();
    for(;;){
      const s=await read();if(s.fishing.phase!=='reeling')break;expect(s.fishing.species).toBe(species);
      if(s.fishing.tension>75&&s.fishing.holding){await page.mouse.up();}
      else if(s.fishing.tension<40&&!s.fishing.holding){await page.mouse.down();expect((await read()).fishing.holding).toBe(true);}
      if(!screenshot&&s.fishing.progress>40){await page.screenshot({path:test.info().outputPath(`reeling-${species}-${s.rareCaughtCount}.png`)});screenshot=true;}
      if(Date.now()-start>60000)throw new Error(`Reeling did not complete: ${JSON.stringify(s.fishing)}`);
      await page.waitForTimeout(55);
    }
    await page.mouse.up();const s=await read();expect(s.fish.some(f=>f.state==='carried'&&f.species===species)).toBe(true);
    await note(`caught-${species}-${s.rareCaughtCount}`);
  }
  async function hunt(){
    const golden=(await read()).fish.some(f=>f.state==='carried'&&f.species==='golden');
    // Place fast rare fish beside the real shop wall, which blocks their nearest escape route.
    if(golden){await walk(0,-2);await walk(-1.7,-2);await walk(-1.7,0);await aim(-Math.PI/2,-.4);}
    else{await walk(0,-1.7);await aim(0,-.4);}
    await page.keyboard.press('KeyE');
    expect((await read()).lastAction.reason).toBe('place-fish');await mode('combat');
    let held=false;let jumpSeen=false;let hitSeen=false;const start=Date.now();
    try{
      for(;;){const s=await read();expect(s.gamePhase).toBe('running');const fish=s.fish[0];expect(fish).toBeTruthy();
        if(fish.state==='groundedDead')break;
        expect(fish.state).toBe('groundedAlive');const p=s.player.position;
        await aim(Math.atan2(fish.position.x-p.x,fish.position.z-p.z),-.4);
        const distance=Math.hypot(fish.position.x-p.x,fish.position.z-p.z);
        if(distance>1.15&&!held){await page.keyboard.down('KeyW');held=true;}
        else if(distance<=1.15&&held){await page.keyboard.up('KeyW');held=false;}
        if(s.attackCooldownRemaining===0&&distance<1.75){await page.mouse.down();await page.mouse.up();if(!hitSeen){await page.screenshot({path:test.info().outputPath(`hit-${fish.species}.png`)});hitSeen=true;}}
        if(!jumpSeen&&fish.jumpPhase!=='idle'){jumpSeen=true;await page.screenshot({path:test.info().outputPath(`jump-${fish.species}.png`)});}
        if(Date.now()-start>16000)throw new Error(`Hunt timeout ${JSON.stringify(fish)}`);
        await page.waitForTimeout(35);
      }
    }finally{await page.keyboard.up('KeyW');}
    const corpse=(await read()).fish[0];if(Math.hypot(corpse.position.x-(await read()).player.position.x,corpse.position.z-(await read()).player.position.z)>1.7)await walk(corpse.position.x,corpse.position.z);
    await page.keyboard.press('KeyE');expect((await read()).inventory.some(f=>f.id===corpse.id)).toBe(true);await note(`killed-picked-${corpse.species}`);return corpse.id;
  }
  async function sell(id:string,buy?:'club'|'hammer'){
    await walk(0,-2);await walk(-6,-2);await page.keyboard.press('KeyE');await expect(page.locator('#shop-menu')).toBeVisible();
    await page.locator(`#shop-list [data-fish-id="${id}"]`).click();await page.locator('#sell-button').click();expect((await read()).terminalFish.some(f=>f.id===id&&f.state==='sold')).toBe(true);
    if(buy){await page.locator(`.buy-weapon[data-weapon-id=${buy}]`).click();expect((await read()).unlockedWeapons).toContain(buy);}
    await page.locator('#close-shop').click();await ensureLock();if(buy)await page.keyboard.press(buy==='club'?'Digit2':'Digit4');
    await walk(0,-2);await note(`sold-${id}${buy?`-bought-${buy}`:''}`);
  }
  try{
    await page.goto('/?test=1&clock=real');await page.evaluate(()=>window.__islandTest!.reset({seed:45734,fixture:'shore',initial:{player:{position:{x:0,y:1,z:-5},yaw:Math.PI}}}));
    await page.keyboard.press('Escape');await page.getByRole('button',{name:'继续探索',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);await page.mouse.move(mx,my);await note('public-preparation-only-seed-and-player');
    await catchFish('tuna');await sell(await hunt(),'club');
    await catchFish('sprat');const food=await hunt();await page.keyboard.press('Tab');await page.locator(`#inventory-list [data-fish-id="${food}"]`).click();const hunger=(await read()).player.hunger;await page.locator('#eat-button').click();expect((await read()).player.hunger).toBeGreaterThan(hunger);expect((await read()).consumedFish[0].id).toBe(food);await page.locator('#close-inventory').click();await ensureLock();await note('ate-real-sprat');
    for(let i=0;i<3;i++){await catchFish('golden');await sell(await hunt(),i===2?'hammer':undefined);}
    let s=await read();expect(s.rareCaughtCount).toBe(3);expect(s.boss.state).toBe('active');expect(s.events.filter(e=>e.type==='boss_spawn')).toHaveLength(1);expect(s.coins).toBe(75);expect(s.stats).toMatchObject({caught:5,killed:5,sold:4});
    await walk(0,9.2,true);await page.keyboard.press('Escape');await page.getByRole('button',{name:'保存进度',exact:true}).click();await expect(page.locator('#menu .storage-status')).toContainText('已保存');await note('saved-active-real-boss');
    await page.reload();await page.getByRole('button',{name:'读取存档',exact:true}).click();await expect(page.locator('#menu .storage-status')).toContainText('已读取');s=await read();expect(s.gamePhase).toBe('paused');expect(s.coins).toBe(75);expect(s.rareCaughtCount).toBe(3);expect(s.stats.caught).toBe(5);await note('loaded-real-indexeddb-paused');
    await page.getByRole('button',{name:'继续探索',exact:true}).click();await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);mx=page.viewportSize()!.width/2;my=page.viewportSize()!.height/2;await page.mouse.move(mx,my);
    const seen=new Set<string>();const start=Date.now();let warningCaptured=false;let phase2Captured=false;
    while((await read()).gamePhase==='running'){
      s=await read();const warning=s.boss.attacks.find(a=>a.phase==='warning'&&!seen.has(a.id));
      if(warning){seen.add(warning.id);if(!warningCaptured||(s.boss.phase===2&&!phase2Captured)){await page.screenshot({path:test.info().outputPath(`boss-warning-phase-${s.boss.phase}.png`)});warningCaptured=true;if(s.boss.phase===2)phase2Captured=true;}
        const x=warning.type==='tentacle'?warning.position.x:warning.target.x;await walk(x>=0?-2.4:2.4,9.2,true);
      }
      s=await read();await aim(Math.atan2(-s.player.position.x,12-s.player.position.z),0);
      if(s.attackCooldownRemaining===0){await page.mouse.down();await page.mouse.up();}
      if(Date.now()-start>60000)throw new Error('Real Boss fight timed out');await page.waitForTimeout(40);
    }
    s=await read();expect(s.gamePhase).toBe('victory');expect(s.boss.hp).toBe(0);expect(s.player.hp).toBeGreaterThan(0);expect(s.stats.bossDamageDealt).toBe(600);expect(s.events.filter(e=>e.type==='victory')).toHaveLength(1);await note('victory-real-native-input');
    for(const viewport of [{width:1280,height:720},{width:1920,height:1080}]){await page.setViewportSize(viewport);for(const id of ['#hp-value','#coins-value','#play-button','#victory-stats'])await expect(page.locator(id)).toBeInViewport();await page.screenshot({path:test.info().outputPath(`victory-${viewport.width}.png`)});}
    const frozen=await read();await page.waitForTimeout(300);expect(await read()).toEqual(frozen);expect(errors).toEqual([]);
  }finally{const finalState=await read().catch(error=>({observationError:String(error)}));const nativeInputLog=await page.evaluate(()=>Reflect.get(window,'__nativeInputLog')).catch(error=>({observationError:String(error)}));const body=JSON.stringify({finalState,nativeInputLog,preparation:'One reset: seed45734, shore, player (0,1,-5) yaw PI. No injected fish/coins/weapons/rare/Boss HP; no advanceTicks, dispatch or second reset.',evidence,errors},null,2);const path=test.info().outputPath('actual-input-timeline.json');await writeFile(path,body);await test.info().attach('actual-input-timeline',{path,contentType:'application/json'});}
});
