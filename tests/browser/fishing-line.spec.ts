import { test, expect } from '@playwright/test';

for (const width of [1280, 1920]) {
  test(`held fishing line and cast lifecycle at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/');
    await page.locator('#play-button').click();
    await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await page.screenshot({ path: test.info().outputPath('normal-held-line.png') });
    await page.goto('/?test=1');
    await page.waitForFunction(() => Boolean(window.__islandTest));
    await page.evaluate(() => window.__islandTest!.reset({ seed: 1, fixture: 'shore', initial: {
      player: { position: { x: 0, y: 1, z: 9 } },
    } }));
    await page.keyboard.press('Escape'); await page.locator('#play-button').click();
    await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await page.screenshot({ path: test.info().outputPath('idle-line.png') });
    await page.mouse.down();
    await page.evaluate(() => window.__islandTest!.advanceTicks(30));
    expect((await page.evaluate(() => window.__islandTest!.getState())).fishing.phase).toBe('charging');
    await page.screenshot({ path: test.info().outputPath('charging-line.png') });
    await page.mouse.up();
    expect((await page.evaluate(() => window.__islandTest!.getState())).fishing.phase).toBe('waiting');
    await page.screenshot({ path: test.info().outputPath('cast-line.png') });
    await page.evaluate(() => window.__islandTest!.advanceTicks(120)); await page.mouse.down();
    await page.evaluate(() => window.__islandTest!.advanceTicks(10));
    expect((await page.evaluate(() => window.__islandTest!.getState())).fishing.phase).toBe('reeling');
    await page.screenshot({ path: test.info().outputPath('reeling-line.png') });
    await page.mouse.up(); await page.keyboard.press('KeyR');
    expect((await page.evaluate(() => window.__islandTest!.getState())).fishing.cast).toBeNull();
    await page.screenshot({ path: test.info().outputPath('retrieved-line.png') });
    await page.keyboard.press('Digit2');
    await page.screenshot({ path: test.info().outputPath('stowed-line.png') });
    await page.keyboard.press('Digit1'); await page.keyboard.press('Escape');
    await page.screenshot({ path: test.info().outputPath('paused-line.png') });
    expect(errors).toEqual([]);
  });
}
