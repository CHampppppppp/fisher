import { test, expect } from '@playwright/test';
import type { IslandTest } from '../../src/testing/test-api.ts';

declare global { interface Window { __islandTest?: IslandTest } }

// A separate BigInt calculator chooses pre-draw states; catching remains real input.
const inverseDraw = (output: number) => {
  const undo = (value: bigint, shift: number, left: boolean) => {
    let result = value;
    for (let i = shift; i < 32; i += shift) result ^= left ? value << BigInt(i) : value >> BigInt(i);
    return result & 0xffffffffn;
  };
  return Number(undo(undo(undo(BigInt(output), 5, true), 17, false), 13, true));
};
const definitions = [
  { id: 'sprat', name: '银鳍鱼', rarity: '普通', probability: 55, struggle: 8, output: 1 },
  { id: 'bass', name: '岩鲈鱼', rarity: '常见', probability: 28, struggle: 12, output: Math.ceil(.55 * 4294967296) },
  { id: 'tuna', name: '蓝背鱼', rarity: '稀有', probability: 14, struggle: 16, output: Math.ceil(.83 * 4294967296) },
  { id: 'golden', name: '金鳞鱼', rarity: '极稀有', probability: 3, struggle: 20, output: Math.ceil(.97 * 4294967296) },
];

test('all four actual catches show species name, rarity and distinct carried models', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?test=1');
  for (const definition of definitions) {
    await page.setViewportSize(definition.id === 'tuna' || definition.id === 'golden'
      ? { width: 1920, height: 1080 } : { width: 1280, height: 720 });
    await page.evaluate(async ({ state }) => {
      const api = window.__islandTest!;
      await api.reset({ seed: 42, fixture: 'shore', initial: { fishRngState: state, player: { position: { x: 0, y: 1, z: 9 } } } });
      await api.dispatch({ type: 'primaryDown' }); await api.advanceTicks(30); await api.dispatch({ type: 'primaryUp' });
      await api.advanceTicks(120); await api.dispatch({ type: 'primaryDown' });
    }, { state: inverseDraw(definition.output) });
    const reeling = await page.evaluate(() => window.__islandTest!.getState());
    expect(reeling.fishing.species).toBe(definition.id); expect(reeling.fish).toHaveLength(0);
    expect(reeling.fishRngState).toBe(definition.output);
    await expect(page.locator('#fishing-status')).toContainText(definition.name);
    await expect(page.locator('#species-detail')).toContainText(`${definition.probability}%`);
    await expect(page.locator('#species-detail')).toContainText(`+${definition.struggle}/秒`);
    const landed = await page.evaluate(async () => {
      const api = window.__islandTest!;
      for (let i = 0; i < 2000 && (await api.getState()).fishing.phase === 'reeling'; i++) {
        const tension = (await api.getState()).fishing.tension;
        if (tension > 75) await api.dispatch({ type: 'primaryUp' });
        else if (tension < 40) await api.dispatch({ type: 'primaryDown' });
        await api.advanceTicks(6);
      }
      return api.getState();
    });
    expect(landed.fish).toHaveLength(1); expect(landed.fish[0].species).toBe(definition.id);
    expect(landed.events.map(event => event.type)).toEqual(['cast', 'bite', 'hooked', 'landing']);
    await expect(page.locator('#fishing-status')).toContainText(`${definition.name} · 捕获成功`);
    await expect(page.locator('#species-detail')).toContainText(definition.rarity);
    await expect(page.locator('#species-detail')).toBeInViewport();
    await expect(page.locator('#place-fish')).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`${definition.id}-carried.png`) });
  }
  expect(errors).toEqual([]);
});

test('actual adapter matches independent fish sequences despite rendered frames and movement', async ({ page }) => {
  await page.goto('/?test=1');
  const results = await page.evaluate(async () => {
    const api = window.__islandTest!; const rows = [];
    for (const seed of [0, 1, 42, 0x12345678, 0xffffffff]) {
      await api.reset({ seed, fixture: 'shore', initial: { player: { position: { x: 0, y: 1, z: 9 } } } });
      let expected = BigInt(seed || 1); const mask = 0xffffffffn;
      for (let i = 0; i < 8; i++) {
        await api.dispatch({ type: 'move', forward: -1, strafe: 0, sprint: false }); await api.advanceTicks(6);
        await api.dispatch({ type: 'move', forward: 1, strafe: 0, sprint: false }); await api.advanceTicks(6);
        await api.dispatch({ type: 'move', forward: 0, strafe: 0, sprint: false });
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        await api.dispatch({ type: 'look', yaw: 0, pitch: 0 });
        await api.dispatch({ type: 'primaryDown' }); await api.dispatch({ type: 'primaryUp' }); await api.advanceTicks(120);
        const beforeHook = await api.getState();
        if (beforeHook.fishRngState !== Number(expected) || beforeHook.fishing.species !== null) throw new Error('Premature draw');
        await api.dispatch({ type: 'primaryDown' });
        expected = (expected ^ (expected << 13n)) & mask;
        expected = (expected ^ (expected >> 17n)) & mask;
        expected = (expected ^ (expected << 5n)) & mask;
        const u = Number(expected) / 4294967296;
        const species = u < .55 ? 'sprat' : u < .83 ? 'bass' : u < .97 ? 'tuna' : 'golden';
        const state = await api.getState();
        rows.push({ actual: [state.fishRngState, state.fishing.species], expected: [Number(expected), species] });
        await api.dispatch({ type: 'cancelFishing' });
      }
    }
    return rows;
  });
  expect(results).toHaveLength(40); for (const row of results) expect(row.actual).toEqual(row.expected);
});

test('failed catch consumes the first draw, second real catch succeeds; reset RNG rejects atomically', async ({ page }) => {
  await page.goto('/?test=1');
  const result = await page.evaluate(async () => {
    const api = window.__islandTest!;
    await api.reset({ seed: 9000, fixture: 'shore', initial: { player: { position: { x: 0, y: 1, z: 9 } } } });
    await api.dispatch({ type: 'primaryDown' }); await api.dispatch({ type: 'primaryUp' }); await api.advanceTicks(120);
    await api.dispatch({ type: 'primaryDown' }); const first = await api.getState(); await api.advanceTicks(300);
    const failed = await api.getState();
    const snapshot = await api.getState(); snapshot.fishRngState = 1;
    let rejected = false;
    try { await api.reset({ seed: 1, fixture: 'shore', initial: { fishRngState: 0 } }); } catch { rejected = true; }
    const afterReject = await api.getState();
    await api.dispatch({ type: 'look', yaw: 0, pitch: 0 });
    await api.dispatch({ type: 'primaryDown' }); await api.dispatch({ type: 'primaryUp' }); await api.advanceTicks(120);
    await api.dispatch({ type: 'primaryDown' }); const second = await api.getState();
    for (let i = 0; i < 2000 && (await api.getState()).fishing.phase === 'reeling'; i++) {
      const tension = (await api.getState()).fishing.tension;
      if (tension > 75) await api.dispatch({ type: 'primaryUp' }); else if (tension < 40) await api.dispatch({ type: 'primaryDown' });
      await api.advanceTicks(6);
    }
    return { first, failed, second, landed: await api.getState(), rejected, afterReject };
  });
  expect(result.first.fish).toHaveLength(0); expect(result.failed.fishing.result).toBe('line-broken');
  expect(result.failed.fish).toHaveLength(0); expect(result.failed.fishRngState).toBe(result.first.fishRngState);
  expect(result.rejected).toBe(true); expect(result.afterReject).toEqual(result.failed);
  let expected = BigInt(9000);
  const draw = () => {
    expected = (expected ^ (expected << 13n)) & 0xffffffffn;
    expected = (expected ^ (expected >> 17n)) & 0xffffffffn;
    expected = (expected ^ (expected << 5n)) & 0xffffffffn;
    const u = Number(expected) / 4294967296;
    return u < .55 ? 'sprat' : u < .83 ? 'bass' : u < .97 ? 'tuna' : 'golden';
  };
  expect(result.first.fishing.species).toBe(draw()); const second = draw();
  expect(result.second.fishing.species).toBe(second); expect(result.second.fishRngState).toBe(Number(expected));
  expect(result.landed.fish).toHaveLength(1); expect(result.landed.fish[0].species).toBe(second);
  expect(result.landed.events.filter(event => event.type === 'landing')).toHaveLength(1);
});
