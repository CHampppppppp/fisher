import './ui/style.css';
import { Game } from './game/game.ts';
import { GameClock } from './game/clock.ts';
import { Controller } from './game/controller.ts';
import { IslandView } from './render/scene.ts';
import { UI } from './ui/ui.ts';
import { registerTestApi } from './testing/test-api.ts';
import { FishingAudio } from './ui/fishing-audio.ts';
import { Persistence } from './game/persistence.ts';
import { readSettings, writeSettings } from './game/settings.ts';

const ui = new UI(document.querySelector<HTMLElement>('#app')!);

async function initialize(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const bossPlaytest = params.get('playtest') === 'boss';
  const game = new Game(bossPlaytest);
  ui.setBossPlaytest(bossPlaytest);
  const preferences = readSettings(); game.installSettings(preferences.settings,writeSettings);
  if (preferences.error) ui.setSettingsMessage(preferences.error);
  const view = new IslandView(ui.canvas, game.getWorld());
  const audio = new FishingAudio();
  let controller: Controller | undefined;
  const draw = () => { const state = game.getState(); controller?.observePhase(state); view.render(state); ui.update(state); audio.update(state); };
  const testing = params.get('test') === '1';
  const realClock = params.get('clock') === 'real';
  const clock = new GameClock(game, draw, testing && !realClock);
  controller = new Controller(game, clock, ui, draw);
  const persistence = new Persistence(game, {
    status: (message,busy) => ui.setStorageStatus(message,busy),
    beginLoad: () => controller!.beginLoad(), endLoad: () => controller!.endLoad(),
    restored: () => { view.rebuild(game.getWorld()); controller!.restored(); audio.clearHistory(); },
  }, undefined, !bossPlaytest);
  controller.setPersistence(persistence);
  draw(); clock.start();
  if (testing) {
    registerTestApi(game, clock, controller, view, ui, draw, Promise.resolve(), persistence, realClock, () => audio.clearHistory());
  }
  ui.canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault(); controller.pause();
    ui.fatal('图形上下文已丢失。请刷新页面重新进入海岛。');
  });
  if (import.meta.hot) import.meta.hot.dispose(() => {
    controller.dispose(); clock.dispose(); view.dispose(); audio.dispose();
    if (testing) Reflect.deleteProperty(window, '__islandTest');
  });
}

void initialize().catch(error => {
  console.error('Island initialization failed:', error);
  ui.fatal('海岛初始化失败。请确认桌面浏览器支持 WebGL2，然后刷新重试。');
});
