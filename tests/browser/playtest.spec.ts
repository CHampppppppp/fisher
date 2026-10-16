import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';
declare global { interface Window { __islandTest?: IslandTest } }

test('Boss trial uses live controls, both phases and victory, then restarts without touching saves', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/?test=1');
  const ordinary = await page.evaluate(async () => {
    await window.__islandTest!.reset({seed: 5, fixture: 'shore', initial: {coins: 123}});
    await window.__islandTest!.dispatch({type:'save'});
    return window.__islandTest!.exportSave();
  });
  await page.goto('/?playtest=boss&test=1');
  await expect(page.locator('#playtest-banner')).toBeVisible();
  await expect(page.getByRole('button', {name:'开始挑战', exact:true})).toBeVisible();
  await expect(page.locator('[data-storage-action]:visible')).toHaveCount(0);
  const initial = await page.evaluate(() => window.__islandTest!.getState());
  expect(initial.boss.hp).toBe(600); expect(initial.currentWeapon).toBe('hammer');
  expect(initial.gamePhase).toBe('paused');
  await page.evaluate(() => window.__islandTest!.advanceTicks(600));
  expect((await page.evaluate(() => window.__islandTest!.getState())).simulationTick).toBe(0);
  await page.getByRole('button', {name:'开始挑战', exact:true}).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  for (let hit = 0; hit < 10; hit++) {
    await page.mouse.down(); await page.mouse.up();
    await page.evaluate(() => window.__islandTest!.advanceTicks(66));
    if (hit === 4) {
      const state = await page.evaluate(() => window.__islandTest!.getState());
      expect(state.boss.phase).toBe(2); expect(state.boss.hp).toBe(275);
    }
  }
  await expect(page.getByRole('button', {name:'再次挑战', exact:true})).toBeVisible();
  expect((await page.evaluate(() => window.__islandTest!.getState())).gamePhase).toBe('victory');
  await page.screenshot({path: test.info().outputPath('boss-playtest-victory.png')});
  page.once('dialog', d => d.accept());
  await page.getByRole('button', {name:'再次挑战', exact:true}).click();
  expect((await page.evaluate(() => window.__islandTest!.getState())).boss.hp).toBe(600);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', {name:'继续挑战', exact:true})).toBeVisible();
  await page.evaluate(async () => {
    for (const type of ['save','load']) {
      const result = await window.__islandTest!.dispatch({type});
      if (result?.accepted) throw new Error('Trial unexpectedly accessed storage');
    }
  });
  await page.goto('/?test=1');
  await expect(page.locator('#playtest-banner')).toBeHidden();
  expect((await page.evaluate(() => window.__islandTest!.getState())).boss.state).toBe('locked');
  await page.evaluate(() => window.__islandTest!.dispatch({type:'load'}));
  const restored = await page.evaluate(() => window.__islandTest!.getState());
  expect(restored.coins).toBe(ordinary.state.coins);
  expect(restored.player).toEqual(ordinary.state.player);
  expect(errors).toEqual([]);
});

test('ordinary Boss entry uses real time and keeps trial identification at both viewports', async ({page}) => {
  for (const width of [1280,1920]) {
    await page.setViewportSize({width,height:width===1280?720:1080});
    await page.goto('/?playtest=boss');
    expect(await page.evaluate(() => typeof window.__islandTest)).toBe('undefined');
    await expect(page.getByRole('link', {name:'返回普通游戏'})).toBeVisible();
    await page.getByRole('button', {name:'开始挑战',exact:true}).click();
    await expect(page.locator('#boss-hp')).toHaveText('600 / 600');
    await expect(page.locator('#hunger-value')).not.toHaveText('100', {timeout:5000});
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'继续挑战',exact:true})).toBeVisible();
    await page.screenshot({path:test.info().outputPath(`boss-playtest-${width}.png`)});
    const badge=await page.locator('#playtest-banner').boundingBox();
    expect(badge!.x).toBeGreaterThanOrEqual(0); expect(badge!.x+badge!.width).toBeLessThanOrEqual(width);
  }
});
