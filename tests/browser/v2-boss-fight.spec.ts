import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';
test('v2 prepared encounter can be won by native spear attacks while dodging a moving two-phase boss',async({page})=>{
 test.setTimeout(300000);await page.addInitScript(()=>{const records:unknown[]=[];(window as any).__nativeEvidence=records;for(const type of ['keydown','keyup','mousedown','mouseup','mousemove','wheel'])document.addEventListener(type,event=>{const e=event as KeyboardEvent&MouseEvent&WheelEvent;const item:any={sequence:records.length+1,type,timeStamp:event.timeStamp,wallTime:Date.now(),isTrusted:event.isTrusted,code:e.code,button:e.button,movementX:e.movementX,movementY:e.movementY,deltaY:e.deltaY};records.push(item);const api=(window as any).__islandTest;if(api)void api.getState().then((s:any)=>item.simulationTickBefore=s.simulationTick);},{capture:true,passive:true});});
 await page.goto('/?test=1');await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena',initial:{unlockedWeapons:['spear'],currentWeapon:'spear'}}));await page.keyboard.press('Escape');const box=await page.locator('#play-button').boundingBox();await page.locator('#play-button').click();await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
 let x=box!.x+box!.width/2,y=box!.y+box!.height/2,phase2=false;const held=new Set<string>(),inputs:unknown[]=[];
 for(let i=0;i<600;i++){
  const s=await page.evaluate(()=>window.__islandTest!.getState());if(s.gamePhase!=='running')break;const p=s.player,b=s.boss,dx=b.position.x-p.position.x,dz=b.position.z-p.position.z,d=Math.hypot(dx,dz);
  let yaw=Math.atan2(dx,dz)-p.yaw;while(yaw>Math.PI)yaw-=2*Math.PI;while(yaw< -Math.PI)yaw+=2*Math.PI;
  const pitch=Math.atan2(b.position.y-(p.position.y+1.62),Math.max(.01,d));x+=yaw/.002;y-=(Math.max(-1.4,Math.min(1.4,pitch))-p.pitch)/.002;await page.mouse.move(x,y);
  const key=b.jumpPhase==='warning'||b.jumpPhase==='jumping'?'KeyD':d<3.8?'KeyS':d>4.5?'KeyW':'KeyD';
  for(const old of held)if(old!==key){await page.keyboard.up(old);held.delete(old);}if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
  const reach=Math.hypot(dx,b.position.y-p.position.y-.9,dz)-2;
  if(s.attackCooldownRemaining===0&&reach<=3.15){await page.mouse.down();await page.mouse.up();inputs.push({tick:s.simulationTick,kind:'native-spear-click',bossHP:b.hp});}
  if(b.phase===2&&!phase2){phase2=true;await page.screenshot({path:test.info().outputPath('v2-boss-native-phase2.png')});}
  inputs.push({kind:'advanceTicks',beforeTick:s.simulationTick,count:6});await page.evaluate(()=>window.__islandTest!.advanceTicks(6));
 }
 for(const key of held)await page.keyboard.up(key);const end=await page.evaluate(()=>window.__islandTest!.getState());
 const native=await page.evaluate(()=>(window as any).__nativeEvidence);await writeFile(test.info().outputPath('boss-native-inputs.json'),JSON.stringify({preparation:'boss-arena + spear; prepared encounter, not natural progression',nativeEvents:native,driverInputs:inputs,end},null,2));
 await test.info().attach('boss-native-inputs',{body:JSON.stringify({preparation:'boss-arena + spear unlocked; not normal game progression; native mouse/keyboard with production tick acceleration',inputs,end},null,2),contentType:'application/json'});
 await page.screenshot({path:test.info().outputPath('v2-boss-native-result.png')});expect(phase2).toBe(true);expect(end.gamePhase).toBe('victory');expect(end.stats.bossDamageDealt).toBe(600);expect(end.events.filter(e=>e.type==='victory')).toHaveLength(1);await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(false);
});
