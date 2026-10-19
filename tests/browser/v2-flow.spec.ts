import {writeFile} from 'node:fs/promises';
import {test,expect,type Page} from '@playwright/test';
const state=(p:Page)=>p.evaluate(()=>window.__islandTest!.getState());
const tick=(p:Page,n:number)=>p.evaluate(n=>window.__islandTest!.advanceTicks(n),n);
test('v2 native zero-resource capture, place, punch, pickup, sell, buy, then capture and kill with the new tool',async({page})=>{
 test.setTimeout(300000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Legal RNG preparation only: first tuna, then sprat. No fish, money, weapons or catch reward is injected.
 await page.addInitScript(()=>{const records:unknown[]=[];(window as any).__nativeEvidence=records;for(const type of ['keydown','keyup','mousedown','mouseup','mousemove','wheel'])document.addEventListener(type,event=>{const e=event as KeyboardEvent&MouseEvent&WheelEvent;const item:any={sequence:records.length+1,type,timeStamp:event.timeStamp,wallTime:Date.now(),isTrusted:event.isTrusted,code:e.code,button:e.button,movementX:e.movementX,movementY:e.movementY,deltaY:e.deltaY};records.push(item);const api=(window as any).__islandTest;if(api)void api.getState().then((s:any)=>item.simulationTickBefore=s.simulationTick);},{capture:true,passive:true});});
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:13320,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9}}}}));
 let mouse={x:0,y:0};const inputs:unknown[]=[];
 const tick=async(p:Page,n:number)=>{inputs.push({kind:'advanceTicks',beforeTick:(await state(p)).simulationTick,count:n});await p.evaluate(n=>window.__islandTest!.advanceTicks(n),n);};
 async function lock(){await page.keyboard.press('Escape');const b=await page.locator('#play-button').boundingBox();await page.locator('#play-button').click();mouse={x:b!.x+b!.width/2,y:b!.y+b!.height/2};await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);}
 async function aim(yaw:number,pitch=0){const p=(await state(page)).player,dx=(yaw-p.yaw)/.002,dy=-(pitch-p.pitch)/.002;mouse={x:mouse.x+dx,y:mouse.y+dy};inputs.push({kind:'mouseMove',dx,dy});await page.mouse.move(mouse.x,mouse.y);}
 async function walk(code:string,n:number){inputs.push({kind:'key',code,ticks:n});await page.keyboard.down(code);await tick(page,n);await page.keyboard.up(code);}
 async function capture(){await page.mouse.down();await tick(page,30);await page.mouse.up();await tick(page,120);await page.mouse.down();let held=true;
  for(let i=0;i<400;i++){const s=await state(page),f=s.fishing;if(f.phase!=='reeling')break;
   const x=-f.pullDirection.x-f.rodOffset.x,y=-f.pullDirection.y-f.rodOffset.y;mouse={x:mouse.x+x*200,y:mouse.y-y*200};await page.mouse.move(mouse.x,mouse.y);
   if(held&&f.tension>75){await page.mouse.up();held=false;}else if(!held&&f.tension<40){await page.mouse.down();held=true;}
   await tick(page,6);
  }await page.mouse.up();const s=await state(page);expect(s.fish.filter(f=>f.state==='carried')).toHaveLength(1);inputs.push({kind:'capture-complete',tick:s.simulationTick,fish:s.fish.find(f=>f.state==='carried')!.id});
 }
 async function placeAndKill(slot:string){await aim(Math.PI,-.6);await page.keyboard.press('KeyE');await page.keyboard.press(slot);
  for(let i=0;i<15;i++){const s=await state(page),fish=s.fish[0];expect(fish).toBeDefined();if(fish.state==='groundedDead')break;
   const p=s.player,d=Math.hypot(fish.position.x-p.position.x,fish.position.z-p.position.z);await aim(Math.atan2(fish.position.x-p.position.x,fish.position.z-p.position.z),-.65);
   if(d>1.3)await walk('KeyW',Math.min(12,Math.ceil((d-1.2)*15)));
   await page.mouse.down();await page.mouse.up();await tick(page,slot==='Digit2'?18:42);
  }const s=await state(page);expect(s.fish[0].state).toBe('groundedDead');await page.keyboard.press('KeyE');expect((await state(page)).inventory).toHaveLength(1);
 }
 await lock();await capture();expect((await state(page)).fish[0].species).toBe('tuna');await page.screenshot({path:test.info().outputPath('v2-flow-caught.png')});await placeAndKill('Digit2');
 // Walk only along legal, unobstructed ground from the observed current position.
 let p=(await state(page)).player.position;await aim(Math.PI);await walk('KeyW',Math.round((p.z+3)*15));p=(await state(page)).player.position;
 await aim(-Math.PI/2);await walk('KeyW',Math.round((p.x+6)*15));await page.keyboard.press('KeyE');await expect(page.locator('#shop-menu')).toBeVisible();await page.locator('.shop-item').click();await page.locator('#sell-button').click();expect((await state(page)).coins).toBe(45);
 await page.locator('[data-weapon-id=club].buy-weapon').click();expect((await state(page)).coins).toBe(15);await page.screenshot({path:test.info().outputPath('v2-flow-purchased.png')});await lock();
 await page.keyboard.press('Digit3');await aim(Math.PI/2);await walk('KeyW',45);p=(await state(page)).player.position;await aim(0);await walk('KeyW',Math.round((9-p.z)*15));await page.keyboard.press('Digit1');await capture();expect((await state(page)).fish[0].species).toBe('sprat');await placeAndKill('Digit3');
 const end=await state(page);expect(end.stats.caught).toBe(2);expect(end.stats.killed).toBe(2);expect(end.stats.sold).toBe(1);expect(end.events.filter(e=>e.type==='buy')).toHaveLength(1);expect(end.attack.weaponId).toBe('club');expect(errors).toEqual([]);
 await page.screenshot({path:test.info().outputPath('v2-flow-club-kill.png')});const native=await page.evaluate(()=>(window as any).__nativeEvidence);await writeFile(test.info().outputPath('native-inputs.json'),JSON.stringify({preparation:'shore seed13320, player north shore; zero coins, empty fish/inventory; no rewards injected',nativeEvents:native,driverInputs:inputs,end},null,2));await test.info().attach('native-inputs',{body:JSON.stringify({preparation:'shore seed13320; zero money/empty fish and inventory; all flow input native, time advanced by production ticks',inputs,end},null,2),contentType:'application/json'});
});
test('v2 native jump then immediate Escape can save before the next simulation tick',async({page})=>{
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore'}));await page.keyboard.press('Escape');await page.locator('#play-button').click();await page.keyboard.press('Space');await page.keyboard.press('Escape');const before=await state(page);expect(before.locomotion).toBe('air');await page.getByRole('button',{name:'保存游戏',exact:true}).click();await expect(page.locator('#menu .storage-status')).toContainText('已保存');
});
