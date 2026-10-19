import {writeFile} from 'node:fs/promises';
import {test,expect} from '@playwright/test';

test('actual Boss landing pushes the native game camera once and protection prevents repeated displacement',async({page})=>{
 await page.goto('/?test=1');await page.waitForFunction(()=>Boolean(window.__islandTest));
 await page.evaluate(()=>window.__islandTest!.reset({seed:1,fixture:'boss-arena'}));
 await page.keyboard.press('Escape');await page.locator('#play-button').click();
 await expect.poll(()=>page.evaluate(()=>Boolean(document.pointerLockElement))).toBe(true);
 await page.evaluate(()=>window.__islandTest!.advanceTicks(164));
 const before=await page.evaluate(()=>window.__islandTest!.getState());
 await page.screenshot({path:test.info().outputPath('before-landing.png')});
 await page.evaluate(()=>window.__islandTest!.advanceTicks(1));
 const after=await page.evaluate(()=>window.__islandTest!.getState());
 await page.screenshot({path:test.info().outputPath('after-hit-knockback.png')});
 expect(before.player.hp-after.player.hp).toBe(15);
 expect(Math.hypot(after.player.position.x-before.player.position.x,after.player.position.z-before.player.position.z)).toBeCloseTo(1.2,7);
 await page.evaluate(()=>window.__islandTest!.advanceTicks(20));
 const protectedState=await page.evaluate(()=>window.__islandTest!.getState());
 expect(protectedState.player.position).toEqual(after.player.position);expect(protectedState.player.hp).toBe(85);
 await page.keyboard.press('Escape');const paused=await page.evaluate(()=>window.__islandTest!.getState());
 await page.evaluate(()=>window.__islandTest!.advanceTicks(180));expect(await page.evaluate(()=>window.__islandTest!.getState())).toEqual(paused);
 await writeFile(test.info().outputPath('actual-landing-states.json'),JSON.stringify({preparation:'boss-arena fixture, production advanceTicks, native menu inputs; not natural progression',before,after,protectedState,paused},null,2));
});
