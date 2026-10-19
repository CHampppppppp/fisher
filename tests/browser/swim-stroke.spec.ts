import {writeFile} from 'node:fs/promises';import {test,expect} from '@playwright/test';
test('native short Space stroke, idle sinking, Ctrl, pause, ascent and climbing',async({page})=>{
 await page.goto('/?test=1');await page.waitForFunction(()=>Boolean(window.__islandTest));await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:-3,z:12},yaw:Math.PI}}}));
 await page.keyboard.press('Escape');await page.locator('#play-button').click();await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);
 const state=()=>page.evaluate(()=>window.__islandTest!.getState()),tick=(n:number)=>page.evaluate(n=>window.__islandTest!.advanceTicks(n),n);
 await tick(60);const sink=await state();expect(sink.player.position.y).toBeLessThan(-3.25);await page.screenshot({path:test.info().outputPath('default-sinking.png')});
 await page.keyboard.down('Space');await tick(3);await page.keyboard.up('Space');const release=await state();await tick(20);const drift=await state();expect(drift.player.position.y).toBeGreaterThan(release.player.position.y+.4);await page.screenshot({path:test.info().outputPath('short-stroke-rise.png')});
 await page.keyboard.press('Escape');const frozen=await state();await tick(120);expect(await state()).toEqual(frozen);await page.keyboard.press('Escape');
 await expect.poll(()=>page.evaluate(()=>!!document.pointerLockElement)).toBe(true);await page.keyboard.down('ControlRight');await tick(30);await page.keyboard.up('ControlRight');const dive=await state();expect(dive.player.position.y).toBeLessThan(drift.player.position.y-.9);
 await page.keyboard.down('Space');await tick(180);await page.keyboard.down('KeyW');await tick(60);await page.keyboard.up('Space');await page.keyboard.up('KeyW');const land=await state();expect(land.locomotion).toBe('ground');expect(land.player.position.y).toBe(1);await page.screenshot({path:test.info().outputPath('climbed-shore.png')});
 await writeFile(test.info().outputPath('stroke-states.json'),JSON.stringify({source:'native keyboard with public production tick acceleration; shore fixture',sink,release,drift,dive,land},null,2));
});
