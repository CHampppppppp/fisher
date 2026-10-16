import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';

declare global { interface Window { __islandTest?: IslandTest } }

async function readyAtNorthShore(page: import('@playwright/test').Page) {
  await page.goto('/?test=1');
  await page.evaluate(() => window.__islandTest!.reset({
    seed: 2, fixture: 'shore', initial: { player: { position: { x: 0, y: 1, z: 9 }, yaw: 0, pitch: 0 } },
  }));
}

test('normal mouse input casts; Q and mouse-accessible buttons switch/cancel', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await readyAtNorthShore(page);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '继续探索' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.mouse.down(); await page.evaluate(() => window.__islandTest!.advanceTicks(30));
  await page.evaluate(() => window.__islandTest!.dispatch({ type: 'setMode', mode: 'fishing' }));
  await page.mouse.up();
  const cast = await page.evaluate(() => window.__islandTest!.getState());
  expect(cast.fishing.phase).toBe('waiting'); expect(cast.fishing.cast!.distance).toBeCloseTo(10.5, 6);
  await expect(page.locator('#cancel-fishing')).toBeVisible();
  await expect(page.locator('#fishing-status')).toContainText('等待');
  await page.screenshot({ path: test.info().outputPath('waiting-1280.png') });
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(false);
  await expect(page.locator('#inventory-menu')).toBeVisible();
  await page.locator('#close-inventory').click(); // Tab now freezes in inventory; close before using gameplay HUD buttons.
  await page.locator('#cancel-fishing').click();
  expect((await page.evaluate(() => window.__islandTest!.getState())).fishing.phase).toBe('idle');
  await page.locator('#mode-button').click();
  expect((await page.evaluate(() => window.__islandTest!.getState())).mode).toBe('combat');
  await expect(page.locator('#fishing-status')).toContainText('战斗');
  await page.keyboard.press('KeyQ'); expect((await page.evaluate(() => window.__islandTest!.getState())).mode).toBe('fishing');
  await page.keyboard.press('KeyQ'); expect((await page.evaluate(() => window.__islandTest!.getState())).mode).toBe('combat');
  await page.locator('#mode-button').click();
  expect((await page.evaluate(() => window.__islandTest!.getState())).mode).toBe('fishing');
  await page.locator('#world').click({ position: { x: 640, y: 360 } });
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  expect((await page.evaluate(() => window.__islandTest!.getState())).fishing.phase).toBe('idle');
  await page.keyboard.press('KeyQ'); expect((await page.evaluate(() => window.__islandTest!.getState())).mode).toBe('combat');
  await page.keyboard.press('KeyQ');
  await page.mouse.down(); await page.evaluate(() => window.__islandTest!.advanceTicks(60));
  await expect(page.locator('#cast-distance')).toHaveText('18.0 m');
  await page.screenshot({ path: test.info().outputPath('charging-1280.png') });
  await page.mouse.up(); await page.keyboard.press('KeyQ');
  const cancelled = await page.evaluate(() => window.__islandTest!.getState());
  expect(cancelled.mode).toBe('combat'); expect(cancelled.fishing.cast).toBeNull(); expect(cancelled.coins).toBe(0);
  expect(errors).toEqual([]);
});

test('real adapter casts at 3/10.5/18m, blocks movement, constrains look and cleans 20 sessions', async ({ page }) => {
  await readyAtNorthShore(page);
  const result = await page.evaluate(async () => {
    const api = window.__islandTest!; const distances: number[] = []; const ids: number[] = [];
    for (let i = 0; i < 20; i++) {
      await api.dispatch({ type: 'primaryDown' }); await api.advanceTicks([0, 30, 90][i % 3]);
      await api.dispatch({ type: 'primaryUp' }); const first = await api.getState();
      distances.push(first.fishing.cast!.distance); ids.push(first.fishing.cast!.id);
      await api.dispatch({ type: 'move', forward: 1, strafe: 1, sprint: true }); await api.advanceTicks(60);
      if (JSON.stringify((await api.getState()).player.position) !== JSON.stringify(first.player.position)) throw new Error('Fishing moved');
      await api.dispatch({ type: 'look', yaw: 3, pitch: 1.4 });
      const looked = await api.getState();
      if (Math.abs(looked.player.yaw - looked.fishing.cast!.yaw) > 20 * Math.PI / 180 + 1e-9) throw new Error('Yaw outside float view');
      if (i === 10) { await api.dispatch({ type: 'pause' }); await api.advanceTicks(300); await api.dispatch({ type: 'resume' }); }
      await api.dispatch({ type: 'cancelFishing' });
      if ((await api.getState()).fishing.cast !== null) throw new Error('Residual fishing session');
      await api.dispatch({ type: 'look', yaw: 0, pitch: 0 });
    }
    return { distances, ids, state: await api.getState() };
  });
  expect(result.distances.slice(0, 3)).toEqual([3, 10.5, 18]); expect(new Set(result.ids).size).toBe(20);
  expect(result.state.fishing.phase).toBe('idle'); expect(result.state.fishing.cast).toBeNull(); expect(result.state.coins).toBe(0);
});

test('land, shop, paused menu and injected targets cannot create a valid session', async ({ page }) => {
  await page.goto('/?test=1');
  await page.evaluate(async () => {
    const api = window.__islandTest!;
    await api.reset({ seed: 1, fixture: 'shore' });
    await api.dispatch({ type: 'primaryDown' });
    await api.dispatch({ type: 'primaryUp' });
  });
  await expect(page.locator('#fishing-status')).toContainText('落点在陆地');
  const result = await page.evaluate(async () => {
    const api = window.__islandTest!;
    await api.reset({ seed: 1, fixture: 'shore' });
    await api.dispatch({ type: 'primaryDown' }); const land = await api.dispatch({ type: 'primaryUp' });
    await api.reset({ seed: 1, fixture: 'shore', initial: { player: { position: { x: -6, y: 1, z: -4 } } } });
    await api.dispatch({ type: 'primaryDown' }); await api.advanceTicks(60); const shop = await api.dispatch({ type: 'primaryUp' });
    await api.dispatch({ type: 'pause' }); const menu = await api.dispatch({ type: 'primaryDown' });
    await api.dispatch({ type: 'resume' });
    const injection = await api.dispatch({ type: 'primaryUp', position: { x: 100, y: 0, z: 100 }, valid: true });
    return { land, shop, menu, injection, state: await api.getState() };
  });
  expect(result.land.reason).toBe('land'); expect(result.shop.reason).toBe('obstructed'); expect(result.menu.reason).toBe('paused');
  expect(result.injection.accepted).toBe(false); expect(result.state.fishing.cast).toBeNull();
});

test('1920x1080 charge/float feedback and buttons remain in viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await readyAtNorthShore(page);
  await page.evaluate(async () => {
    await window.__islandTest!.dispatch({ type: 'primaryDown' }); await window.__islandTest!.advanceTicks(30);
  });
  for (const selector of ['#mode-button', '#cancel-fishing', '#fishing-status', '#cast-distance'])
    await expect(page.locator(selector)).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('charging-1920.png') });
  await page.evaluate(() => window.__islandTest!.dispatch({ type: 'primaryUp' }));
  await page.screenshot({ path: test.info().outputPath('waiting-1920.png') });
});
