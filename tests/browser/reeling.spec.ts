import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';

declare global { interface Window { __islandTest?: IslandTest; __audioCalls?: number; __audioCreated?: number } }

async function ready(page: import('@playwright/test').Page) {
  await page.goto('/?test=1');
  await page.evaluate(() => window.__islandTest!.reset({ seed: 1, fixture: 'shore', initial: {
    player: { position: { x: 0, y: 1, z: 9 }, yaw: 0, pitch: 0 },
  } }));
}

test('actual bite click/release controls reel; blur/continue freezes and releases input; audio requires interaction', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const Original = window.AudioContext; window.__audioCalls = 0; window.__audioCreated = 0;
    window.AudioContext = class extends Original {
      constructor(options?: AudioContextOptions) { super(options); window.__audioCreated!++; }
      createOscillator() { window.__audioCalls!++; return super.createOscillator(); }
    };
  });
  await ready(page); expect(await page.evaluate(() => window.__audioCreated)).toBe(0);
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '继续探索' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.mouse.down(); await page.evaluate(() => window.__islandTest!.advanceTicks(30)); await page.mouse.up();
  await page.evaluate(() => window.__islandTest!.advanceTicks(119));
  expect((await page.evaluate(() => window.__islandTest!.getState())).fishing.phase).toBe('waiting');
  await page.evaluate(() => window.__islandTest!.advanceTicks(1));
  await expect(page.locator('#fishing-status')).toContainText('咬钩');
  expect(await page.evaluate(() => window.__audioCalls)).toBe(1);
  await page.screenshot({ path: test.info().outputPath('bite-1280.png') });
  await page.mouse.down(); await page.evaluate(() => window.__islandTest!.advanceTicks(60));
  await expect(page.locator('#progress-value')).toHaveText('20.0'); await expect(page.locator('#tension-value')).toHaveText('70.0');
  await page.mouse.up(); await page.evaluate(() => window.__islandTest!.advanceTicks(30));
  await expect(page.locator('#progress-value')).toHaveText('20.0'); await expect(page.locator('#tension-value')).toHaveText('60.0');
  await page.mouse.down(); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const paused = await page.evaluate(() => window.__islandTest!.getState());
  await page.evaluate(() => window.__islandTest!.advanceTicks(300));
  expect(await page.evaluate(() => window.__islandTest!.getState())).toEqual(paused);
  await page.getByRole('button', { name: '继续探索' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
  await page.evaluate(() => window.__islandTest!.advanceTicks(6));
  const resumed = await page.evaluate(() => window.__islandTest!.getState());
  expect(resumed.fishing.progress).toBe(paused.fishing.progress); expect(resumed.fishing.tension).toBeCloseTo(58, 6);
  await page.mouse.up(); expect(errors).toEqual([]);
});

test('seed=1 real 40/75 loop creates one fish/event, rejects another cast, confirmed restart clears it', async ({ page }) => {
  await ready(page);
  const state = await page.evaluate(async () => {
    const api = window.__islandTest!;
    await api.dispatch({ type: 'primaryDown' }); await api.advanceTicks(30); await api.dispatch({ type: 'primaryUp' });
    await api.advanceTicks(120); await api.dispatch({ type: 'primaryDown' });
    for (let i = 0; i < 2000 && (await api.getState()).fishing.phase === 'reeling'; i++) {
      const tension = (await api.getState()).fishing.tension;
      if (tension > 75) await api.dispatch({ type: 'primaryUp' }); else if (tension < 40) await api.dispatch({ type: 'primaryDown' });
      await api.advanceTicks(6);
    }
    await api.advanceTicks(300); return api.getState();
  });
  expect(state.fish).toHaveLength(1); expect(state.fish[0].state).toBe('carried'); expect(state.fish[0].species).toBe('sprat');
  const landing = state.events.filter(event => event.type === 'landing'); expect(landing).toHaveLength(1);
  expect(landing[0].entityId).toBe(state.fish[0].id); expect(state.fishing.phase).toBe('idle');
  expect((await page.evaluate(() => window.__islandTest!.dispatch({ type: 'primaryDown' }))).reason).toBe('carrying-fish');
  await expect(page.locator('#fishing-status')).toContainText('银鳍鱼');
  await expect(page.locator('#restart-button')).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('carried-1280.png') });
  page.once('dialog', dialog => dialog.accept()); await page.locator('#restart-button').click();
  const restarted = await page.evaluate(() => window.__islandTest!.getState());
  expect(restarted.fish).toHaveLength(0); expect(restarted.simulationTick).toBe(0); expect(restarted.events.map(event => event.type)).toEqual(['restart']);
  expect(restarted.fishRngState).toBe(1);
  await expect(page.locator('#pointer-hint')).toBeVisible();
  await page.locator('#world').click({ position: { x: 640, y: 360 } });
  await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
});

test('1920 reel feedback fits, tension failure and missed bite display reasons without fish', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await ready(page);
  await page.evaluate(async () => {
    const api = window.__islandTest!; await api.dispatch({ type: 'primaryDown' }); await api.dispatch({ type: 'primaryUp' });
    await api.advanceTicks(120); await api.dispatch({ type: 'primaryDown' }); await api.advanceTicks(60);
  });
  for (const id of ['tension-value', 'progress-value', 'cancel-fishing', 'mode-button']) await expect(page.locator(`#${id}`)).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath('reeling-1920.png') });
  await page.evaluate(() => window.__islandTest!.advanceTicks(100));
  await expect(page.locator('#fishing-status')).toContainText('断线');
  expect((await page.evaluate(() => window.__islandTest!.getState())).fish).toHaveLength(0);
  await ready(page); await page.evaluate(async () => {
    const api = window.__islandTest!; await api.dispatch({ type: 'primaryDown' }); await api.dispatch({ type: 'primaryUp' }); await api.advanceTicks(180);
  });
  await expect(page.locator('#fishing-status')).toContainText('错过咬钩');
});

test('actual adapter gives failure priority when normal controls complete and break on the same tick', async ({ page }) => {
  await ready(page);
  const state = await page.evaluate(async () => {
    const api = window.__islandTest!;
    await api.dispatch({ type: 'primaryDown' }); await api.dispatch({ type: 'primaryUp' });
    await api.advanceTicks(120); await api.dispatch({ type: 'primaryDown' });
    for (let i = 0; i < 2000 && (await api.getState()).fishing.phase === 'reeling'; i++) {
      const { progress, tension } = (await api.getState()).fishing;
      if (progress >= 70 || tension < 64) await api.dispatch({ type: 'primaryDown' });
      else if (tension > 66.5) await api.dispatch({ type: 'primaryUp' });
      await api.advanceTicks(1);
    }
    return api.getState();
  });
  expect(state.fishing.progress).toBe(100); expect(state.fishing.result).toBe('line-broken');
  expect(state.fishing.highTensionDuration).toBe(0.5); expect(state.fish).toHaveLength(0);
  expect(state.events.filter(event => event.type === 'landing')).toHaveLength(0);
});
