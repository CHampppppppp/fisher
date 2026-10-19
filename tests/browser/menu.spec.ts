import {test, expect, type Page} from '@playwright/test';
import type {IslandTest} from '../../src/testing/test-api.ts';
declare global {interface Window {__islandTest?: IslandTest}}
const state = (page: Page) => page.evaluate(() => window.__islandTest!.getState());

test('menus hide gameplay HUD and remain usable at desktop and narrow panel sizes', async ({page}) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{width:1280,height:720},{width:1920,height:1080},{width:561,height:850}]) {
    await page.setViewportSize(viewport);
    await page.goto('/?playtest=boss&test=1');
    await expect(page.locator('#playtest-banner')).toBeVisible();
    for (const selector of ['#hud','#boss-hud','#weapon-bar','#rare-progress','#fishing-info']) await expect(page.locator(selector)).toBeHidden();
    await expect(page.locator('#play-button')).toBeInViewport({ratio:1});
    await expect(page.locator('#settings-button')).toBeInViewport({ratio:1});
    const menu = await page.locator('.menu-content').boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0); expect(menu!.x+menu!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({path:test.info().outputPath(`menu-${viewport.width}.png`)});
    await page.locator('#play-button').click();
    await expect.poll(() => page.evaluate(() => Boolean(document.pointerLockElement))).toBe(true);
    await expect(page.locator('#hud')).toBeVisible(); await expect(page.locator('#boss-hud')).toBeVisible();
    await page.screenshot({path:test.info().outputPath(`hud-${viewport.width}.png`)});
    await page.keyboard.press('Escape'); await expect(page.locator('#hud')).toBeHidden();
    await page.locator('#menu-help summary').click(); await expect(page.locator('#controls')).toBeVisible();
    await page.keyboard.press('Escape'); await expect(page.locator('#controls')).toBeHidden();
    await expect(page.locator('#menu')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('Escape cancels binding capture first and settings still return to pause', async ({page}) => {
  await page.goto('/?test=1');
  await page.locator('#settings-button').click();
  await page.locator('[data-binding-action=interact]').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings-menu')).toBeVisible();
  await expect(page.locator('#settings-status')).toHaveText('已取消绑定');
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeVisible();
  expect((await state(page)).gamePhase).toBe('paused');
});
