import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';

declare global { interface Window { __islandTest?: IslandTest; __punchSounds?: number } }

async function clickPrimary(page: import('@playwright/test').Page) {
  await page.mouse.down();
  await page.mouse.up();
}

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/?test=1');
  await page.evaluate(async () => {
    await window.__islandTest!.reset({ seed: 1, fixture: 'fish-arena' });
    await window.__islandTest!.dispatch({ type: 'setMode', mode: 'combat' });
  });
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '继续探索' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
}

test('real clicks punch once, hold does not repeat, HP/death and synthesized sounds agree', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Original = window.AudioContext; window.__punchSounds = 0;
    window.AudioContext = class extends Original {
      createOscillator() { window.__punchSounds!++; return super.createOscillator(); }
    };
  });
  await ready(page); await page.mouse.down(); await page.evaluate(() => window.__islandTest!.advanceTicks(6));
  await expect(page.locator('#attack-feedback')).toContainText('命中');
  await expect(page.locator('#live-fish-status')).toContainText('HP 10/20');
  expect(await page.evaluate(() => window.__punchSounds)).toBe(2);
  await page.screenshot({ path: test.info().outputPath('punch-hit-1280.png') });
  await page.evaluate(() => window.__islandTest!.advanceTicks(48)); await page.mouse.up();
  let state = await page.evaluate(() => window.__islandTest!.getState());
  expect(state.fish[0].hp).toBe(10); expect(state.events.filter(event => event.type === 'fish_damage')).toHaveLength(1);
  await clickPrimary(page); state = await page.evaluate(() => window.__islandTest!.getState());
  expect(state.fish[0].state).toBe('groundedDead'); expect(state.fish[0].hp).toBe(0);
  await expect(page.locator('#live-fish-status')).toContainText('尸体');
  await expect(page.locator('#attack-feedback')).toContainText('击杀');
  await page.screenshot({ path: test.info().outputPath('corpse-1280.png') });
  await page.evaluate(() => window.__islandTest!.advanceTicks(500)); await clickPrimary(page);
  state = await page.evaluate(() => window.__islandTest!.getState());
  expect(state.events.filter(event => event.type === 'fish_death')).toHaveLength(1);
  expect(state.events.filter(event => event.type === 'fish_damage')).toHaveLength(2);
  expect(state.fish[0].state).toBe('groundedDead'); expect(errors).toEqual([]);
});

test('real chase reaches a hopping fish; punching keeps held movement and pause freezes cooldown', async ({ page }) => {
  await ready(page); await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => window.__islandTest!.advanceTicks(132));
  await page.keyboard.down('KeyW'); await page.evaluate(() => window.__islandTest!.advanceTicks(12));
  await clickPrimary(page); const before = await page.evaluate(() => window.__islandTest!.getState()); expect(before.fish[0].hp).toBe(10);
  await page.keyboard.down('ShiftLeft');
  await page.evaluate(() => window.__islandTest!.advanceTicks(3)); await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
  const moved = await page.evaluate(() => window.__islandTest!.getState()); expect(moved.player.position.z).toBeCloseTo(before.player.position.z + .3,6);
  await page.keyboard.press('Escape'); const paused = await page.evaluate(() => window.__islandTest!.getState());
  await page.evaluate(() => window.__islandTest!.advanceTicks(300)); expect(await page.evaluate(() => window.__islandTest!.getState())).toEqual(paused);
  await page.getByRole('button', { name: '继续探索' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.evaluate(() => window.__islandTest!.advanceTicks(24)); await clickPrimary(page);
  await expect(page.locator('#attack-feedback')).toContainText('击杀');
  await expect(page.locator('#live-fish-status')).toContainText('HP 0/20');
  await page.screenshot({ path: test.info().outputPath('chase-corpse-1920.png') });
});

test('actual adapter gives death priority over sea crossing and ignores injected attacks', async ({ page }) => {
  await page.goto('/?test=1');
  const results = await page.evaluate(async () => {
    const api = window.__islandTest!; const rows = [];
    for (const attack of [true,false]) {
      await api.reset({ seed:1,fixture:'fish-arena',initial:{ player:{position:{x:0,y:1,z:9.1},yaw:0}, fish:[
        {id:'edge',species:'sprat',state:'groundedAlive',position:{x:0,y:1,z:9.99},hp:10,jumpTimer:1.8-1/60},
      ] } });
      await api.dispatch({type:'setMode',mode:'combat'}); await api.advanceTicks(1);
      const invalid = await api.dispatch({type:'primaryDown',targetId:'edge',damage:100});
      const afterInvalid = await api.getState();
      if(attack) await api.dispatch({type:'primaryDown'}); await api.advanceTicks(1);
      rows.push({ invalid,afterInvalid,state:await api.getState() });
    }
    return rows;
  });
  for(const row of results) { expect(row.invalid.accepted).toBe(false); expect(row.afterInvalid.attackCooldownRemaining).toBe(0); expect(row.afterInvalid.fish[0].hp).toBe(10); }
  expect(results[0].state.fish[0].state).toBe('groundedDead'); expect(results[0].state.fish[0].position.z).toBeLessThanOrEqual(9.800001);
  expect(results[0].state.terminalFish).toHaveLength(0); expect(results[0].state.events.filter(event=>event.type==='fish_death')).toHaveLength(1);
  expect(results[1].state.fish).toHaveLength(0); expect(results[1].state.terminalFish).toHaveLength(1);
});
