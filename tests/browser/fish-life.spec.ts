import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';

declare global { interface Window { __islandTest?: IslandTest } }

test('real E key and visible button place carried fish; invalid water/body placements preserve it', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=1');
  const reset = () => page.evaluate(() => window.__islandTest!.reset({ seed: 1, fixture: 'fish-arena', initial: { fish: [
    { id: 'held', species: 'bass', state: 'carried', position: { x: 0, y: 1, z: 3.5 }, jumpTimer: 0 },
  ] } }));
  await reset(); await expect(page.locator('#place-fish')).toBeVisible();
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '继续探索' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.keyboard.press('KeyE');
  let state = await page.evaluate(() => window.__islandTest!.getState());
  expect(state.fish).toHaveLength(1); expect(state.fish[0].state).toBe('groundedAlive');
  await expect(page.locator('#place-fish')).toBeHidden(); await expect(page.locator('#live-fish-status')).toContainText('岩鲈鱼');
  await page.screenshot({ path: test.info().outputPath('placed-bass-1280.png') });
  await reset(); await page.keyboard.press('Tab'); await page.locator('#close-inventory').click(); await page.locator('#place-fish').click();
  state = await page.evaluate(() => window.__islandTest!.getState()); expect(state.fish[0].state).toBe('groundedAlive');
  expect(state.events.filter(event => event.type === 'fish_place')).toHaveLength(1);
  for (const [position, pitch, reason] of [
    [{ x: 0, y: 1, z: 9 }, 0, 'water'], [{ x: 0, y: 1, z: 3.5 }, -1.4, 'body-overlap'],
  ] as const) {
    const result = await page.evaluate(async ({ position, pitch }) => {
      const api = window.__islandTest!;
      await api.reset({ seed: 1, fixture: 'fish-arena', initial: { player: { position, pitch }, fish: [
        { id: 'held', species: 'sprat', state: 'carried', position, jumpTimer: 0 },
      ] } });
      const before = (await api.getState()).fish; const action = await api.dispatch({ type: 'interact' });
      return { before, after: (await api.getState()).fish, action };
    }, { position, pitch });
    expect(result.action.reason).toBe(reason); expect(result.after).toEqual(result.before);
    await expect(page.locator('#placement-hint')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('four live fish warn and animate actual jumps; blur freezes midair then explicit continue resumes', async ({ page }) => {
  await page.goto('/?test=1'); await page.setViewportSize({ width: 1920, height: 1080 });
  for (const [species, name, ticks, distance] of [
    ['sprat','银鳍鱼',108,.9], ['bass','岩鲈鱼',84,1.2], ['tuna','蓝背鱼',72,1.4], ['golden','金鳞鱼',54,1.8],
  ] as const) {
    await page.evaluate(({ species }) => window.__islandTest!.reset({ seed: 1, fixture: 'fish-arena', initial: { fish: [
      { id: species, species, state: 'groundedAlive', position: { x: 0, y: 1, z: 5 }, jumpTimer: 0 },
    ] } }), { species });
    await page.evaluate(ticks => window.__islandTest!.advanceTicks(ticks), ticks - 12);
    await expect(page.locator('#live-fish-status')).toContainText(`${name} · 起跳预兆`);
    await page.screenshot({ path: test.info().outputPath(`${species}-warning-1920.png`) });
    await page.evaluate(() => window.__islandTest!.advanceTicks(24));
    const mid = await page.evaluate(() => window.__islandTest!.getState());
    expect(mid.fish[0].jumpPhase).toBe('jumping'); expect(mid.fish[0].position.y).toBeCloseTo(1.4, 6);
    expect(mid.fish[0].position.z).toBeCloseTo(5 + distance / 2, 6);
    await expect(page.locator('#live-fish-status')).toContainText('跳跃中');
    await page.screenshot({ path: test.info().outputPath(`${species}-jump-1920.png`) });
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); const paused = await page.evaluate(() => window.__islandTest!.getState());
    await page.evaluate(() => window.__islandTest!.advanceTicks(300)); expect(await page.evaluate(() => window.__islandTest!.getState())).toEqual(paused);
    await page.getByRole('button', { name: '继续探索' }).click();
    await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await page.evaluate(() => window.__islandTest!.advanceTicks(12));
    const landed = await page.evaluate(() => window.__islandTest!.getState());
    expect(landed.fish[0].position.y).toBe(1); expect(landed.fish[0].position.z).toBeCloseTo(5 + distance, 6);
  }
});

test('actual escape removes fish/model, announces once and cannot interact; shop blocks a fish', async ({ page }) => {
  await page.goto('/?test=1');
  await page.evaluate(() => window.__islandTest!.reset({ seed: 1, fixture: 'fish-arena', initial: { fish: [
    { id: 'escape', species: 'sprat', state: 'groundedAlive', position: { x: 0, y: 1, z: 9.7 }, jumpTimer: 0 },
  ] } }));
  await page.evaluate(() => window.__islandTest!.advanceTicks(132));
  await expect(page.locator('#fish-notice')).toContainText('银鳍鱼逃入海中');
  const result = await page.evaluate(async () => {
    const api = window.__islandTest!; await api.advanceTicks(3000);
    const action = await api.dispatch({ type: 'interact' }); return { action, state: await api.getState() };
  });
  expect(result.state.fish).toHaveLength(0); expect(result.state.terminalFish).toHaveLength(1);
  expect(result.state.events.filter(event => event.type === 'fish_escape')).toHaveLength(1); expect(result.action.accepted).toBe(false);
  await page.evaluate(() => window.__islandTest!.reset({ seed: 1, fixture: 'fish-arena', initial: { fish: [
    { id: 'blocked', species: 'golden', state: 'groundedAlive', position: { x: -4, y: 1, z: 0 }, jumpTimer: 0 },
  ] } }));
  await page.evaluate(() => window.__islandTest!.advanceTicks(78));
  const blocked = (await page.evaluate(() => window.__islandTest!.getState())).fish[0];
  expect(blocked.position.x).toBeGreaterThanOrEqual(-4.300001); expect(blocked.state).toBe('groundedAlive');
});
