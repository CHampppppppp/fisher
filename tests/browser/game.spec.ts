import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';

declare global { interface Window { __islandTest?: IslandTest } }

test('only test URL exposes adapter; manual simulation matches rendered HUD', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByRole('button', { name: '开始游戏' })).toBeVisible();
  expect(await page.evaluate(() => '__islandTest' in window)).toBe(false);
  await page.goto('/?test=1');
  const result = await page.evaluate(async () => {
    const api = window.__islandTest!; await api.waitUntilIdle();
    await api.reset({ seed: 7, fixture: 'shore' });
    await api.dispatch({ type: 'move', forward: 1, strafe: 0, sprint: false }); await api.advanceTicks(60);
    const walking = await api.getState(); walking.player.position.z = 123;
    const protectedState = await api.getState();
    await api.dispatch({ type: 'pause' }); const paused = await api.getState();
    await api.advanceTicks(300); const frozen = await api.getState();
    await api.dispatch({ type: 'resume' }); await api.advanceTicks(60); const resumed = await api.getState();
    await api.reset({ seed: 7, fixture: 'shore' });
    await api.dispatch({ type: 'move', forward: 1, strafe: 0, sprint: true }); await api.advanceTicks(60);
    const sprint = await api.getState();
    await api.dispatch({ type: 'jump' }); await api.advanceTicks(12); const air = await api.getState();
    await api.advanceTicks(60); const landed = await api.getState();
    return { protectedState, paused, frozen, resumed, sprint, air, landed };
  });
  expect(result.protectedState.player.position.z).toBeCloseTo(4, 6);
  expect(result.frozen).toEqual(result.paused);
  expect(result.resumed.player.position).toEqual(result.paused.player.position);
  expect(result.sprint.player.position.z).toBeCloseTo(6, 6);
  expect(result.air.player.position.y).toBeGreaterThan(1.5); expect(result.landed.player.position.y).toBe(1);
  await expect(page.locator('#hp-value')).toHaveText('100'); await expect(page.locator('#coins-value')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('invalid resets are atomic, shore and shop stop the body', async ({ page }) => {
  await page.goto('/?test=1');
  const result = await page.evaluate(async () => {
    const api = window.__islandTest!; await api.reset({ seed: 123, fixture: 'shore' });
    const before = await api.getState(); let rejected = false;
    try { await api.reset({ seed: 1, fixture: 'shore', initial: { player: { position: { x: -6, y: 1, z: 0 } } } }); }
    catch { rejected = true; }
    const after = await api.getState();
    await api.dispatch({ type: 'move', forward: 1, strafe: 0, sprint: true }); await api.advanceTicks(600);
    const coast = await api.getState();
    await api.reset({ seed: 1, fixture: 'shore' });
    await api.dispatch({ type: 'move', forward: 0, strafe: -1, sprint: true }); await api.advanceTicks(600);
    const shop = await api.getState();
    return { before, after, rejected, coast, shop };
  });
  expect(result.rejected).toBe(true); expect(result.after).toEqual(result.before);
  expect(result.coast.player.position.z).toBeCloseTo(9.7, 6);
  expect(result.shop.player.position.x).toBeCloseTo(-4.2, 6);
});

test('normal game Pointer Lock, Esc, blur and hidden pause until explicit continue', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: '开始游戏' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.keyboard.down('w'); await page.waitForTimeout(150); await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeVisible();
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.keyboard.down('w'); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeVisible();
  await page.getByRole('button', { name: '继续游戏' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.getByRole('button', { name: '继续游戏' })).toBeVisible();
});

test('held keyboard input is released on blur, pause and reset in the production controller', async ({ page }) => {
  await page.goto('/?test=1');
  await page.evaluate(() => window.__islandTest!.reset({ seed: 1, fixture: 'shore' }));
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '继续游戏' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.keyboard.down('w'); await page.evaluate(() => window.__islandTest!.advanceTicks(60));
  const moving = await page.evaluate(() => window.__islandTest!.getState());
  expect(moving.player.position.z).toBeCloseTo(4, 5);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const frozen = await page.evaluate(() => window.__islandTest!.getState());
  await page.evaluate(() => window.__islandTest!.advanceTicks(300));
  expect(await page.evaluate(() => window.__islandTest!.getState())).toEqual(frozen);
  await page.getByRole('button', { name: '继续游戏' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  // OS key-repeat can arrive after refocusing while W is still physically held.
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', repeat: true, bubbles: true })));
  await page.evaluate(() => window.__islandTest!.advanceTicks(60));
  expect((await page.evaluate(() => window.__islandTest!.getState())).player.position).toEqual(frozen.player.position);
  await page.keyboard.up('w'); await page.keyboard.down('w');
  await page.evaluate(() => window.__islandTest!.reset({ seed: 2, fixture: 'shore' }));
  await page.evaluate(() => window.__islandTest!.advanceTicks(60));
  expect((await page.evaluate(() => window.__islandTest!.getState())).player.position).toEqual({ x: 0, y: 1, z: 0 });
});

for (const [width, height] of [[1280, 720], [1920, 1080]]) {
  test(`menus and HUD fit ${width}x${height}`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height }); await page.goto('/');
    await expect(page.getByRole('button', { name: '开始游戏' })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`start-${width}.png`) });
    await page.getByRole('button', { name: '开始游戏' }).click();
    await expect(page.locator('#hud')).toBeVisible();
    for (const id of ['hp-value', 'hunger-value', 'coins-value', 'weapon-bar']) await expect(page.locator(`#${id}`)).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`hud-${width}.png`) });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
