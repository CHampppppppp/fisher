import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game/game.ts';
import { GameClock } from '../src/game/clock.ts';

const fresh = () => { const game = new Game(); game.reset({ seed: 42, fixture: 'shore' }); return game; };
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 0.01, `${a} != ${b}`);
const move = (game: Game, forward = 1, strafe = 0, sprint = false) => game.dispatch({ type: 'move', forward, strafe, sprint });

test('reset gives exact defaults and a detached snapshot', () => {
  const game = fresh(); const s = game.getState();
  assert.deepEqual(s.player.position, { x: 0, y: 1, z: 0 });
  assert.equal(s.player.hp, 100); assert.equal(s.player.hunger, 100); assert.equal(s.coins, 0);
  assert.equal(s.simulationTick, 0); assert.equal(s.gamePhase, 'running'); assert.equal(s.ui.menu, 'none');
  s.player.position.z = 99; s.ui.menu = 'pause'; assert.equal(game.getState().player.position.z, 0);
  game.step(); game.reset({ seed: 4294967295, fixture: 'shore' }); assert.equal(game.getState().simulationTick, 0);
});
test('walking and sprinting move exactly 4 and 6 metres per second', () => {
  for (const [sprint, speed] of [[false, 4], [true, 6]] as const) {
    const game = fresh(); move(game, 1, 0, sprint); game.advanceTicks(60); close(game.getState().player.position.z, speed);
  }
});
test('diagonal movement is normalized and yaw determines local axes', () => {
  const game = fresh(); move(game, 1, 1); game.advanceTicks(60);
  const p = game.getState().player.position; close(Math.hypot(p.x, p.z), 4);
  game.reset({ seed: 0, fixture: 'shore', initial: { player: { yaw: Math.PI / 2 } } });
  move(game); game.advanceTicks(60); close(game.getState().player.position.x, 4);
  close(game.getState().player.position.z, 0);
});
test('jump reaches air, cannot jump in air, lands on sand', () => {
  const game = fresh(); game.dispatch({ type: 'jump' }); game.advanceTicks(12);
  assert.ok(game.getState().player.position.y > 1.5);
  game.dispatch({ type: 'jump' }); assert.equal(game.getState().lastAction.accepted, false);
  game.advanceTicks(60); close(game.getState().player.position.y, 1);
});
test('coast stops the entire body even during jumps and sprinting', () => {
  const game = fresh(); move(game, 1, 1, true); game.dispatch({ type: 'jump' }); game.advanceTicks(600);
  const p = game.getState().player.position; assert.ok(p.x <= 9.7); assert.ok(p.z <= 9.7); close(p.y, 1);
  game.reset({ seed: 1, fixture: 'shore' }); move(game, -1, -1, true); game.advanceTicks(600);
  const q = game.getState().player.position; assert.ok(q.x >= -9.7); assert.ok(q.z >= -9.7);
});
test('shop blocks movement from all sides and airborne movement', () => {
  for (const [position, forward, strafe] of [
    [{ x: -3, y: 1, z: 0 }, 0, -1], [{ x: -9, y: 1, z: 0 }, 0, 1],
    [{ x: -6, y: 1, z: 3 }, -1, 0], [{ x: -6, y: 1, z: -3 }, 1, 0],
  ] as const) {
    const game = fresh(); game.reset({ seed: 1, fixture: 'shore', initial: { player: { position } } });
    move(game, forward, strafe, true); game.dispatch({ type: 'jump' }); game.advanceTicks(120);
    const p = game.getState().player.position;
    assert.ok(p.x >= -4.2 || p.x <= -7.8 || p.z >= 1.8 || p.z <= -1.8);
  }
});
test('pause freezes ticks and position and clears held movement', () => {
  const game = fresh(); move(game); game.advanceTicks(10); game.dispatch({ type: 'pause' });
  const before = game.getState(); game.advanceTicks(300); assert.deepEqual(game.getState(), before);
  assert.equal(before.ui.menu, 'pause'); game.dispatch({ type: 'jump' }); assert.equal(game.getState().lastAction.accepted, false);
  game.dispatch({ type: 'resume' }); game.advanceTicks(60);
  assert.deepEqual(game.getState().player.position, before.player.position);
  assert.equal(game.getState().simulationTick, before.simulationTick + 60);
});
test('look is absolute and pitch clamped; invalid actions are rejected', () => {
  const game = fresh(); game.dispatch({ type: 'look', yaw: 0.5, pitch: 5 });
  close(game.getState().player.yaw, 0.5); close(game.getState().player.pitch, 1.4);
  game.dispatch({ type: 'look', yaw: -1, pitch: -5 }); close(game.getState().player.pitch, -1.4);
  for (const action of [null, {}, { type: 'unknown' }, { type: 'move', forward: 2, strafe: 0, sprint: false },
    { type: 'move', forward: 1, strafe: 0, sprint: 1 }, { type: 'look', yaw: NaN, pitch: 0 }]) {
    const before = game.getState().player; game.dispatch(action); assert.equal(game.getState().lastAction.accepted, false);
    assert.deepEqual(game.getState().player, before);
  }
});
test('invalid resets reject atomically including body outside coast or inside shop', () => {
  const game = fresh(); move(game); game.advanceTicks(10); const before = game.getState();
  for (const input of [null, { seed: -1, fixture: 'shore' }, { seed: 1.5, fixture: 'shore' },
    { seed: 1, fixture: 'other' }, { seed: 1, fixture: 'shore', initial: null },
    { seed: 1, fixture: 'shore', initial: { player: { pitch: 2 } } },
    ...[{ x: 10, y: 1, z: 0 }, { x: -6, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: Infinity, z: 0 }]
      .map(position => ({ seed: 1, fixture: 'shore', initial: { player: { position } } })),
    { seed: 1, fixture: 'shore', initial: { player: { hp: 101 } } }]) { // HP is now a supported reset field.
    assert.throws(() => game.reset(input)); assert.deepEqual(game.getState(), before);
  }
  game.advanceTicks(1); assert.ok(game.getState().player.position.z > before.player.position.z);
});
test('tick counts are validated, zero is idle, maximum is finite', () => {
  const game = fresh(); game.advanceTicks(0); assert.equal(game.getState().simulationTick, 0);
  for (const count of [-1, 1.5, 36001, NaN, '60']) assert.throws(() => game.advanceTicks(count));
  game.advanceTicks(36000); assert.equal(game.getState().simulationTick, 12600);
  assert.equal(game.getState().gamePhase, 'dead'); // Valid maximum request stops when starvation ends the session.
});

test('automatic clock and manual ticks have one owner; paused wall time is discarded', () => {
  const savedRequest = globalThis.requestAnimationFrame;
  const savedCancel = globalThis.cancelAnimationFrame;
  let pending: FrameRequestCallback | undefined; let cancelled = false; let draws = 0;
  globalThis.requestAnimationFrame = callback => { pending = callback; return 1; };
  globalThis.cancelAnimationFrame = () => { cancelled = true; pending = undefined; };
  const frame = (time: number) => { const callback = pending!; pending = undefined; callback(time); };
  try {
    const game = fresh(); const clock = new GameClock(game, () => { draws++; }); clock.start();
    frame(0); frame(17); frame(34); assert.equal(game.getState().simulationTick, 2);
    move(game); game.dispatch({ type: 'pause' }); frame(5000); frame(10000);
    assert.equal(game.getState().simulationTick, 2);
    game.dispatch({ type: 'resume' }); frame(20000); assert.equal(game.getState().simulationTick, 2);
    frame(20017); assert.equal(game.getState().simulationTick, 3);
    assert.deepEqual(game.getState().player.position, { x: 0, y: 1, z: 0 });
    clock.useManualClock(); frame(30000); game.advanceTicks(60); frame(40000);
    assert.equal(game.getState().simulationTick, 63); assert.ok(draws >= 8);
    clock.dispose(); assert.equal(cancelled, true);
  } finally { globalThis.requestAnimationFrame = savedRequest; globalThis.cancelAnimationFrame = savedCancel; }
});

test('normal island shares coast and motion logic; aerial initial state falls safely', () => {
  const game = new Game(); const world = game.getWorld(); world.surface = 99;
  assert.equal(game.getWorld().surface, 1);
  game.dispatch({ type: 'resume' }); move(game, 1, 1, true); game.advanceTicks(600);
  const p = game.getState().player.position; assert.ok(Math.hypot(p.x, p.z) <= 22.7);
  game.reset({ seed: 1, fixture: 'shore', initial: { player: { position: { x: 0, y: 8, z: 0 } } } });
  game.advanceTicks(180); assert.equal(game.getState().player.position.y, 1);
});

const northShore = () => {
  const game = fresh();
  game.reset({ seed: 2, fixture: 'shore', initial: { player: { position: { x: 0, y: 1, z: 9 }, yaw: 0, pitch: 0 } } });
  return game;
};
const cast = (game: Game, ticks = 0) => {
  game.dispatch({ type: 'primaryDown' }); game.advanceTicks(ticks); return game.dispatch({ type: 'primaryUp' });
};

test('fishing defaults to idle and casting 0/0.5/1.5s gives 3/10.5/18m', () => {
  for (const [ticks, distance] of [[0, 3], [30, 10.5], [90, 18]]) {
    const game = northShore(); assert.equal(game.getState().mode, 'fishing'); assert.equal(game.getState().fishing.phase, 'idle');
    assert.equal(cast(game, ticks).accepted, true);
    const fishing = game.getState().fishing;
    assert.equal(fishing.phase, 'waiting'); assert.ok(fishing.cast);
    close(fishing.cast.distance, distance); close(fishing.cast.position.z, 9 + distance); close(fishing.cast.position.y, 0);
    const first = game.getState(); game.advanceTicks(119); assert.equal(game.getState().fishing.phase, 'waiting');
    assert.deepEqual(game.getState().fishing.cast, first.fishing.cast);
    game.advanceTicks(1); assert.equal(game.getState().fishing.phase, 'bite');
    game.advanceTicks(60); assert.equal(game.getState().fishing.phase, 'idle'); assert.equal(game.getState().fish.length, 0);
    assert.equal(first.player.hp, 100); close(first.player.hunger, 100-ticks/120); assert.equal(first.coins, 0);
  }
});

test('land, shop obstruction, menu and combat reject casting without a session', () => {
  const land = fresh(); assert.equal(cast(land).accepted, false);
  assert.equal(land.getState().lastAction.reason, 'land'); assert.equal(land.getState().fishing.cast, null);
  const blocked = fresh(); blocked.reset({ seed: 1, fixture: 'shore', initial: { player: { position: { x: -6, y: 1, z: -4 } } } });
  assert.equal(cast(blocked, 60).accepted, false); assert.equal(blocked.getState().lastAction.reason, 'obstructed');
  assert.equal(blocked.getState().fishing.phase, 'idle');
  const menu = northShore(); menu.dispatch({ type: 'pause' });
  for (const action of [{ type: 'primaryDown' }, { type: 'primaryUp' }, { type: 'setMode', mode: 'combat' }]) {
    assert.equal(menu.dispatch(action).accepted, false); assert.equal(menu.getState().lastAction.reason, 'paused');
  }
  menu.dispatch({ type: 'resume' }); menu.dispatch({ type: 'setMode', mode: 'combat' });
  assert.equal(menu.dispatch({ type: 'primaryDown' }).accepted, true); // combat now punches, never casts.
  assert.equal(menu.getState().fishing.cast, null);
});

test('charging/waiting block motion and jump, waiting look keeps float in view', () => {
  const game = northShore(); move(game); game.dispatch({ type: 'primaryDown' }); game.advanceTicks(30);
  const origin = game.getState().player.position; assert.deepEqual(origin, { x: 0, y: 1, z: 9 });
  assert.equal(game.dispatch({ type: 'jump' }).accepted, false);
  move(game, 1, 1, true); game.advanceTicks(30); assert.deepEqual(game.getState().player.position, origin);
  game.dispatch({ type: 'primaryUp' });
  const castState = game.getState().fishing.cast!;
  game.dispatch({ type: 'look', yaw: 2, pitch: 1.4 });
  const player = game.getState().player;
  assert.ok(Math.abs(player.yaw - castState.yaw) <= 20 * Math.PI / 180 + 1e-9);
  assert.ok(Math.abs(player.pitch - castState.pitch) <= 10 * Math.PI / 180 + 1e-9);
  move(game, -1, 0, true); game.advanceTicks(60); assert.deepEqual(game.getState().player.position, origin);
  game.dispatch({ type: 'cancelFishing' }); assert.equal(game.getState().fishing.phase, 'idle');
  game.dispatch({ type: 'look', yaw: Math.PI, pitch: 0 }); move(game); game.advanceTicks(60);
  close(game.getState().player.position.z, 5);
});

test('20 cast/cancel cycles and mode/pause/reset leave no session or held input', () => {
  const game = northShore();
  for (let i = 0; i < 20; i++) {
    assert.equal(cast(game, 30).accepted, true);
    assert.equal(game.dispatch({ type: 'primaryDown' }).accepted, false);
    if (i === 10) {
      game.dispatch({ type: 'pause' }); game.advanceTicks(300); game.dispatch({ type: 'resume' });
      assert.equal(game.getState().fishing.phase, 'waiting');
    }
    game.dispatch({ type: 'cancelFishing' });
    assert.equal(game.getState().fishing.phase, 'idle'); assert.equal(game.getState().fishing.cast, null);
    game.advanceTicks(1); assert.deepEqual(game.getState().player.position, { x: 0, y: 1, z: 9 });
  }
  cast(game, 60); game.dispatch({ type: 'setMode', mode: 'combat' });
  assert.equal(game.getState().mode, 'combat'); assert.equal(game.getState().fishing.cast, null); assert.equal(game.getState().coins, 0);
  game.dispatch({ type: 'setMode', mode: 'fishing' }); game.dispatch({ type: 'primaryDown' });
  game.dispatch({ type: 'pause' }); game.dispatch({ type: 'resume' });
  assert.equal(game.getState().fishing.phase, 'charging');
  game.advanceTicks(60); close(game.getState().fishing.chargeSeconds, 0);
  game.dispatch({ type: 'primaryDown' }); game.advanceTicks(30);
  assert.equal(game.dispatch({ type: 'primaryUp' }).accepted, true); game.dispatch({ type: 'cancelFishing' });
  cast(game, 0); game.reset({ seed: 4, fixture: 'shore' });
  assert.equal(game.getState().fishing.phase, 'idle'); assert.equal(game.getState().fishing.cast, null);
});

test('cast inputs cannot inject target/session or partially modify state', () => {
  const game = northShore();
  for (const action of [{ type: 'primaryDown', position: { x: 0, y: 0, z: 15 } },
    { type: 'primaryUp', valid: true }, { type: 'setMode', mode: 'invalid' },
    { type: 'cancelFishing', reward: 100 }]) {
    assert.equal(game.dispatch(action).accepted, false); assert.equal(game.getState().fishing.phase, 'idle');
  }
  game.dispatch({ type: 'primaryDown' }); game.advanceTicks(30);
  const before = game.getState().fishing;
  assert.equal(game.dispatch({ type: 'primaryDown' }).accepted, false); assert.deepEqual(game.getState().fishing, before);
  game.dispatch({ type: 'primaryUp' }); const snapshot = game.getState(); snapshot.fishing.cast!.position.z = 999;
  assert.notEqual(game.getState().fishing.cast!.position.z, 999);
});

test('setting the current mode preserves charge/session, changing mode cancels it', () => {
  const game = northShore(); game.dispatch({ type: 'primaryDown' }); game.advanceTicks(30);
  const before = game.getState().fishing;
  game.dispatch({ type: 'setMode', mode: 'fishing' }); assert.deepEqual(game.getState().fishing, before);
  assert.equal(game.dispatch({ type: 'primaryUp' }).accepted, true);
  const waiting = game.getState().fishing;
  game.dispatch({ type: 'setMode', mode: 'fishing' }); assert.deepEqual(game.getState().fishing, waiting);
  game.dispatch({ type: 'setMode', mode: 'combat' }); assert.equal(game.getState().fishing.cast, null);
});

const startReeling = () => {
  const game = northShore(); game.reset({ seed: 1, fixture: 'shore', initial: { player: { position: { x: 0, y: 1, z: 9 } } } });
  cast(game, 30); game.advanceTicks(120); assert.equal(game.dispatch({ type: 'primaryDown' }).accepted, true); return game;
};
const landWithRealInputs = (game: Game) => {
  for (let i = 0; i < 2000 && game.getState().fishing.phase === 'reeling'; i++) {
    const tension = game.getState().fishing.tension;
    if (tension > 75) game.dispatch({ type: 'primaryUp' });
    else if (tension < 40) game.dispatch({ type: 'primaryDown' });
    game.advanceTicks(6);
  }
  return game.getState();
};

test('bite starts at exactly 120 steps and its window lasts exactly 60 steps', () => {
  const game = northShore(); cast(game); game.advanceTicks(119);
  assert.equal(game.getState().fishing.phase, 'waiting'); game.advanceTicks(1);
  assert.equal(game.getState().fishing.phase, 'bite'); close(game.getState().fishing.biteRemaining, 1);
  game.advanceTicks(59); close(game.getState().fishing.biteRemaining, 1 / 60);
  game.dispatch({ type: 'primaryDown' }); assert.equal(game.getState().fishing.phase, 'reeling');
  const missed = northShore(); cast(missed); missed.advanceTicks(180);
  assert.equal(missed.getState().fishing.phase, 'idle'); assert.equal(missed.getState().fishing.result, 'missed-bite');
  assert.equal(missed.getState().fish.length, 0); missed.dispatch({ type: 'primaryDown' });
  assert.notEqual(missed.getState().fishing.phase, 'reeling');
});
test('hold/release uses exact rates; struggling starts at reel step 120 for 30 steps', () => {
  const game = startReeling(); close(game.getState().fishing.progress, 0); close(game.getState().fishing.tension, 40);
  assert.equal(move(game).accepted, false); // A blocked movement attempt must not release the reel button.
  game.advanceTicks(60); close(game.getState().fishing.progress, 20); close(game.getState().fishing.tension, 70);
  game.dispatch({ type: 'primaryUp' }); game.advanceTicks(30);
  close(game.getState().fishing.progress, 20); close(game.getState().fishing.tension, 60);
  game.advanceTicks(29); const before = game.getState().fishing.tension;
  assert.equal(game.getState().fishing.struggling, false); game.advanceTicks(1);
  assert.equal(game.getState().fishing.struggling, true); close(game.getState().fishing.tension, before - 20 / 60 + 8 / 60);
  game.advanceTicks(29); assert.equal(game.getState().fishing.struggling, true);
  game.advanceTicks(1); assert.equal(game.getState().fishing.struggling, false);
});
test('continuous threshold failures occur on the 30th step, without a fish', () => {
  for (const reason of ['line-broken', 'unhooked'] as const) {
    const game = startReeling(); if (reason === 'unhooked') game.dispatch({ type: 'primaryUp' });
    const threshold = reason === 'line-broken' ? 100 : 0;
    while (game.getState().fishing.tension !== threshold) game.advanceTicks(1);
    const duration = reason === 'line-broken' ? 'highTensionDuration' : 'lowTensionDuration';
    close(game.getState().fishing[duration], 1 / 60); game.advanceTicks(28);
    assert.equal(game.getState().fishing.phase, 'reeling'); game.advanceTicks(1);
    assert.equal(game.getState().fishing.phase, 'idle'); assert.equal(game.getState().fishing.result, reason);
    close(game.getState().fishing[duration], 0.5); assert.equal(game.getState().fish.length, 0);
    assert.equal(game.getState().events.filter(event => event.type === 'landing').length, 0);
  }
});
test('the production reel transition checks failure before completion in a tied step', async () => {
  const { createReel, stepReel } = await import('../src/game/reeling.ts');
  const result = stepReel({ ...createReel(), progressTicks: 299, tension: 100, highTicks: 29, ticks: 180 }, true, 'sprat');
  assert.equal(result.state.progressTicks, 300); assert.equal(result.outcome, 'line-broken');
});
test('real 40/75 control lands one unique carried sprat and one event; carried position follows view', () => {
  const game = startReeling(); const landed = landWithRealInputs(game);
  assert.equal(landed.fishing.phase, 'idle'); assert.equal(landed.fishing.progress, 100);
  assert.equal(landed.fish.length, 1); assert.equal(landed.fish[0].species, 'sprat'); assert.equal(landed.fish[0].state, 'carried');
  const events = landed.events.filter(event => event.type === 'landing'); assert.equal(events.length, 1);
  assert.equal(events[0].entityId, landed.fish[0].id); assert.ok(events[0].tick > 150);
  assert.equal(game.dispatch({ type: 'primaryDown' }).reason, 'carrying-fish');
  game.advanceTicks(300); assert.equal(game.getState().events.filter(event => event.type === 'landing').length, 1);
  const position = game.getState().fish[0].position; game.dispatch({ type: 'look', yaw: 1, pitch: 0.3 });
  assert.notDeepEqual(game.getState().fish[0].position, position);
  const snapshot = game.getState(); snapshot.fish[0].position.x = 999; snapshot.events[0].type = 'fake';
  assert.notEqual(game.getState().fish[0].position.x, 999); assert.notEqual(game.getState().events[0].type, 'fake');
  assert.equal(game.dispatch({ type: 'restart', confirm: false }).accepted, false); assert.equal(game.getState().fish.length, 1);
  game.dispatch({ type: 'restart', confirm: true }); assert.equal(game.getState().fish.length, 0); assert.equal(game.getState().simulationTick, 0);
  game.reset({ seed: 1, fixture: 'shore', initial: { player: { position: { x: 0, y: 1, z: 9 } } } });
  cast(game); game.advanceTicks(120); game.dispatch({ type: 'primaryDown' });
  assert.notEqual(landWithRealInputs(game).fish[0].id, landed.fish[0].id);
});
test('pause freezes bite/reel/struggle timers; resume clears hold and does not catch up', () => {
  const bite = northShore(); cast(bite); bite.advanceTicks(140); bite.dispatch({ type: 'pause' });
  const pausedBite = bite.getState(); bite.advanceTicks(300); assert.deepEqual(bite.getState(), pausedBite);
  bite.dispatch({ type: 'resume' }); close(bite.getState().fishing.biteRemaining, 40 / 60);
  const reel = startReeling(); reel.advanceTicks(60); reel.dispatch({ type: 'pause' });
  const paused = reel.getState(); reel.advanceTicks(300); assert.deepEqual(reel.getState(), paused);
  reel.dispatch({ type: 'resume' }); reel.advanceTicks(30);
  close(reel.getState().fishing.progress, 20); close(reel.getState().fishing.tension, 60);
  close(reel.getState().fishing.reelElapsed, 1.5);
});
test('cancel/mode changes cannot reward a fish; event log is bounded to 200', () => {
  const game = startReeling(); game.advanceTicks(90); game.dispatch({ type: 'cancelFishing' });
  assert.equal(game.getState().fish.length, 0); assert.equal(game.getState().fishing.cast, null);
  for (let i = 0; i < 110; i++) { cast(game); game.dispatch({ type: 'cancelFishing' }); }
  assert.equal(game.getState().events.length, 200); assert.equal(game.getState().events.filter(event => event.type === 'landing').length, 0);
  assert.equal(game.dispatch({ type: 'primaryDown', progress: 100 }).accepted, false);
  assert.equal(game.dispatch({ type: 'restart', confirm: true, fish: [{}] }).accepted, false);
});

test('a natural hold/release schedule reaches progress 100 and breaks on the same real step', () => {
  const game = startReeling();
  for (let i = 0; i < 2000 && game.getState().fishing.phase === 'reeling'; i++) {
    const { progress, tension } = game.getState().fishing;
    if (progress >= 70 || tension < 64) game.dispatch({ type: 'primaryDown' });
    else if (tension > 66.5) game.dispatch({ type: 'primaryUp' });
    game.advanceTicks(1);
  }
  const state = game.getState();
  assert.equal(state.fishing.progress, 100); assert.equal(state.fishing.result, 'line-broken');
  close(state.fishing.highTensionDuration, 0.5); assert.equal(state.fish.length, 0);
  assert.equal(state.events.filter(event => event.type === 'landing').length, 0);
});

// Independent BigInt calculator: no production sampling helper is used as an oracle.
const referenceFishDraw = (input: number) => {
  const mask = 0xffffffffn; let state = BigInt(input || 1);
  state = (state ^ (state << 13n)) & mask;
  state = (state ^ (state >> 17n)) & mask;
  state = (state ^ (state << 5n)) & mask;
  const next = Number(state); const u = next / 4294967296;
  return { state: next, species: u < .55 ? 'sprat' : u < .83 ? 'bass' : u < .97 ? 'tuna' : 'golden' };
};
const stateBeforeDraw = (output: number) => {
  const undo = (value: bigint, shift: number, left: boolean) => {
    let result = value;
    for (let i = shift; i < 32; i += shift) result ^= left ? value << BigInt(i) : value >> BigInt(i);
    return result & 0xffffffffn;
  };
  return Number(undo(undo(undo(BigInt(output), 5, true), 17, false), 13, true));
};
const speciesStarts = [1, Math.ceil(.55 * 4294967296), Math.ceil(.83 * 4294967296), Math.ceil(.97 * 4294967296)];
const resetAtNorth = (game: Game, seed: number, fishRngState?: number) => game.reset({ seed, fixture: 'shore', initial: {
  player: { position: { x: 0, y: 1, z: 9 }, yaw: 0, pitch: 0 },
  ...(fishRngState === undefined ? {} : { fishRngState }),
} });
const hook = (game: Game) => { assert.equal(cast(game).accepted, true); game.advanceTicks(120); assert.equal(game.dispatch({ type: 'primaryDown' }).accepted, true); };

test('four fish config and every rarity interval edge match the independent calculator', async () => {
  const { FISH_SPECIES, sampleFish } = await import('../src/game/fish-species.ts');
  assert.deepEqual(Object.keys(FISH_SPECIES), ['sprat', 'bass', 'tuna', 'golden']);
  assert.deepEqual(Object.values(FISH_SPECIES).map(fish => [fish.name, fish.probability, fish.struggle]), [
    ['银鳍鱼', 55, 8], ['岩鲈鱼', 28, 12], ['蓝背鱼', 14, 16], ['金鳞鱼', 3, 20],
  ]);
  for (const output of [1, ...speciesStarts.slice(1).flatMap(edge => [edge - 1, edge]), 0xffffffff]) {
    const previous = stateBeforeDraw(output); const expected = referenceFishDraw(previous);
    assert.equal(expected.state, output); assert.deepEqual(sampleFish(previous), expected);
  }
});

test('fish RNG sequences match multiple seeds, consume only on hook, and ignore movement/frames', () => {
  for (const seed of [0, 1, 42, 0x12345678, 0xffffffff]) {
    const game = new Game(); resetAtNorth(game, seed); let expected = seed || 1;
    assert.equal(game.getState().seed, expected); assert.equal(game.getState().fishRngState, expected);
    for (let i = 0; i < 16; i++) {
      game.dispatch({ type: 'look', yaw: Math.PI, pitch: .2 }); move(game); game.advanceTicks(6);
      move(game, -1); game.advanceTicks(6); move(game, 0);
      game.dispatch({ type: 'look', yaw: 0, pitch: 0 }); game.advanceTicks(7);
      game.dispatch({ type: 'primaryDown' }); game.advanceTicks(30);
      assert.equal(game.getState().fishRngState, expected);
      game.dispatch({ type: 'primaryUp' }); game.advanceTicks(120);
      assert.equal(game.getState().fishing.species, null); assert.equal(game.getState().fishRngState, expected);
      game.dispatch({ type: 'primaryDown' }); const next = referenceFishDraw(expected); expected = next.state;
      assert.equal(game.getState().fishRngState, expected); assert.equal(game.getState().fishing.species, next.species);
      assert.equal(game.getState().fish.length, 0);
      game.dispatch({ type: 'primaryDown' }); game.dispatch({ type: 'pause' }); game.advanceTicks(300);
      game.dispatch({ type: 'resume' }); game.dispatch({ type: 'primaryDown' });
      assert.equal(game.getState().fishRngState, expected);
      game.dispatch({ type: 'cancelFishing' });
    }
  }
});

test('fish RNG initial override validates atomically, snapshots detach, restart restores the initial sequence', () => {
  const game = new Game(); resetAtNorth(game, 42, 0xffffffff);
  move(game, -1); game.advanceTicks(1); const before = game.getState();
  for (const fishRngState of [0, -1, 4294967296, 1.5, NaN, Infinity, '1', null]) {
    assert.throws(() => resetAtNorth(game, 9, fishRngState as number)); assert.deepEqual(game.getState(), before);
  }
  game.advanceTicks(1); assert.ok(game.getState().player.position.z < before.player.position.z);
  const snapshot = game.getState(); snapshot.fishRngState = 9; assert.equal(game.getState().fishRngState, 0xffffffff);
  resetAtNorth(game, 42, 0xffffffff); hook(game);
  const expected = referenceFishDraw(0xffffffff); assert.equal(game.getState().fishRngState, expected.state);
  game.dispatch({ type: 'restart', confirm: true }); assert.equal(game.getState().fishRngState, 0xffffffff);
  game.dispatch({ type: 'setMode', mode: 'fishing' }); // Restart now equips the combat fist; switch back before fishing.
  game.dispatch({ type: 'look', yaw: 0, pitch: 0 }); move(game); game.advanceTicks(135); move(game, 0);
  hook(game); assert.equal(game.getState().fishing.species, expected.species); assert.equal(game.getState().fishRngState, expected.state);
  const ordinary = new Game(); resetAtNorth(ordinary, 0); hook(ordinary);
  ordinary.dispatch({ type: 'restart', confirm: true }); assert.equal(ordinary.getState().seed, 1); assert.equal(ordinary.getState().fishRngState, 1);
});

test('missed bites, invalid casts and reset rejection never consume a fish draw', () => {
  const game = fresh(); const state = game.getState().fishRngState;
  assert.equal(cast(game).accepted, false); assert.equal(game.getState().fishRngState, state);
  resetAtNorth(game, 42); cast(game); game.advanceTicks(180);
  assert.equal(game.getState().fishRngState, 42); assert.equal(game.getState().fish.length, 0);
  assert.equal(game.dispatch({ type: 'primaryDown', species: 'golden' }).accepted, false);
  assert.throws(() => game.reset({ seed: 0, fixture: 'shore', initial: { fishRngState: 2, player: { position: { x: -6, y: 1, z: 0 } } } }));
  assert.equal(game.getState().fishRngState, 42);
});

test('all four fish use their exact 30-tick struggle strength under the same real reel inputs', () => {
  for (const [index, extra] of [8, 12, 16, 20].entries()) {
    const game = new Game(); resetAtNorth(game, 1, stateBeforeDraw(speciesStarts[index])); hook(game);
    game.advanceTicks(60); game.dispatch({ type: 'primaryUp' }); game.advanceTicks(59);
    close(game.getState().fishing.tension, 70 - 20 * 59 / 60);
    assert.equal(game.getState().fishing.struggling, false);
    const before = game.getState().fishing.tension; game.advanceTicks(30);
    close(game.getState().fishing.tension, before - 10 + extra * .5);
    assert.equal(game.getState().fishing.struggling, true); game.advanceTicks(1);
    assert.equal(game.getState().fishing.struggling, false);
    close(game.getState().fishing.tension, before - 10 + extra * .5 - 20 / 60);
  }
});

test('a failed first fish consumes its draw; a real second catch uses the next item only', () => {
  const game = new Game(); resetAtNorth(game, 9000); hook(game);
  const first = referenceFishDraw(9000); const second = referenceFishDraw(first.state);
  assert.equal(game.getState().fishing.species, first.species); game.advanceTicks(300);
  assert.equal(game.getState().fishing.result, 'line-broken'); assert.equal(game.getState().fish.length, 0);
  assert.equal(game.getState().fishRngState, first.state);
  game.dispatch({ type: 'look', yaw: 0, pitch: 0 }); hook(game);
  assert.equal(game.getState().fishing.species, second.species);
  const landed = landWithRealInputs(game); assert.equal(landed.fish.length, 1);
  assert.equal(landed.fish[0].species, second.species); assert.equal(landed.fishRngState, second.state);
  assert.equal(landed.events.filter(event => event.type === 'landing').length, 1);
});

test('all four species land through real control and reproduce with the same seed/state/input', () => {
  for (const output of speciesStarts) {
    const previous = stateBeforeDraw(output); const expected = referenceFishDraw(previous);
    const catches = [];
    for (let repeat = 0; repeat < 2; repeat++) {
      const game = new Game(); resetAtNorth(game, 7, previous); hook(game);
      const state = landWithRealInputs(game); catches.push(state);
      assert.equal(state.fish.length, 1); assert.equal(state.fish[0].species, expected.species);
      assert.equal(state.fish[0].state, 'carried'); assert.equal(state.fishRngState, expected.state);
      assert.deepEqual(state.events.map(event => event.type), ['cast', 'bite', 'hooked', 'landing']);
    }
    assert.deepEqual(catches[0], catches[1]);
  }
  const normalizedCatches = [0, 1].map(seed => {
    const game = new Game(); resetAtNorth(game, seed); hook(game); return landWithRealInputs(game);
  });
  assert.deepEqual(normalizedCatches[0], normalizedCatches[1]);
});

test('carried fish models have distinct geometry silhouettes as well as colors', async () => {
  const THREE = await import('three');
  const { createFishModel } = await import('../src/render/fish-model.ts');
  const sizes = []; const geometrySignatures = [];
  for (const species of ['sprat', 'bass', 'tuna', 'golden'] as const) {
    const model = createFishModel(species); const size = new THREE.Vector3();
    new THREE.Box3().setFromObject(model).getSize(size); sizes.push(size.toArray().map(n => n.toFixed(3)).join(','));
    const vertices: string[] = [];
    model.traverse(object => {
      if (object instanceof THREE.Mesh) {
        vertices.push(Array.from(object.geometry.attributes.position.array).map(n => Number(n).toFixed(3)).join(','));
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
      }
    });
    geometrySignatures.push(vertices.join(';'));
  }
  assert.equal(new Set(sizes).size, 4); assert.equal(new Set(geometrySignatures).size, 4);
});

const arenaFish = (species = 'sprat', position = { x: 0, y: 1, z: 5 }, jumpTimer = 0, state = 'groundedAlive', id = 'test-fish') =>
  ({ id, species, state, position, jumpTimer });
const arena = (fish?: unknown[], player?: unknown) => {
  const game = new Game(); game.reset({ seed: 1, fixture: 'fish-arena', initial: {
    ...(fish === undefined ? {} : { fish }), ...(player === undefined ? {} : { player }),
  } }); return game;
};

test('fish-arena default fish and reset fish input are atomic, distinct and detached', () => {
  const game = arena(); const state = game.getState();
  assert.equal(state.fixture, 'fish-arena'); assert.deepEqual(state.player.position, { x: 0, y: 1, z: 3.5 }); close(state.player.pitch, -.6);
  assert.equal(state.fish.length, 1); assert.equal(state.fish[0].id, 'fixture-fish-1'); assert.equal(state.fish[0].state, 'groundedAlive');
  assert.deepEqual(state.fish[0].position, { x: 0, y: 1, z: 5 }); close(state.fish[0].jumpTimer, 0); assert.deepEqual(state.terminalFish, []);
  state.fish[0].jumpTimer = 99; assert.equal(game.getState().fish[0].jumpTimer, 0);
  for (const fish of [null, [{}], [arenaFish('other')], [arenaFish('sprat', { x: 0, y: 0, z: 5 })],
    [arenaFish('sprat', { x: 0, y: 1, z: 11 })], [arenaFish('sprat', { x: -6, y: 1, z: 0 })],
    [arenaFish('sprat', { x: 0, y: 1, z: 5 }, -1)], [arenaFish('sprat', { x: 0, y: 1, z: 5 }, 1.81)],
    [arenaFish('sprat', { x: 0, y: 1, z: 5 }, NaN)], [arenaFish(), arenaFish()],
    [arenaFish('sprat', { x: 0, y: 1, z: 5 }, 0, 'escaped')],
    [arenaFish('sprat', { x: 0, y: 1, z: 5 }, 0, 'carried', 'a'), arenaFish('bass', { x: 1, y: 1, z: 5 }, 0, 'carried', 'b')]]) {
    const before = game.getState(); assert.throws(() => game.reset({ seed: 9, fixture: 'fish-arena', initial: { fish } }));
    assert.deepEqual(game.getState(), before);
  }
  game.reset({ seed: 1, fixture: 'shore', initial: { fish: [] } }); assert.equal(game.getState().fish.length, 0);
});

test('actual view places one carried fish on land, releases carrying, and rejects invalid placement atomically', () => {
  const game = arena([arenaFish('sprat', { x: 0, y: 1, z: 0 }, 0, 'carried')]);
  const id = game.getState().fish[0].id;
  assert.equal(game.dispatch({ type: 'interact', position: { x: 0, y: 1, z: 8 } }).accepted, false);
  assert.equal(game.getState().fish[0].state, 'carried');
  assert.equal(game.dispatch({ type: 'interact' }).accepted, true);
  const placed = game.getState().fish[0]; assert.equal(placed.id, id); assert.equal(placed.state, 'groundedAlive');
  close(placed.position.z, 3.5 + 2 * Math.cos(-.6)); close(placed.position.y, 1); assert.equal(placed.jumpTimer, 0);
  assert.equal(game.dispatch({ type: 'interact' }).accepted, false); assert.equal(game.getState().fish.length, 1);
  assert.equal(game.dispatch({ type: 'primaryDown' }).accepted, true);
  for (const [position, yaw, pitch, expected] of [
    [{ x: 0, y: 1, z: 9 }, 0, 0, 'water'],
    [{ x: -3.6, y: 1, z: 0 }, -Math.PI / 2, 0, 'obstructed'],
    [{ x: 0, y: 1, z: 0 }, 0, -1.4, 'body-overlap'],
    [{ x: 0, y: 1, z: 0 }, 0, .6, 'no-ground'],
    [{ x: 0, y: 3, z: 0 }, 0, -.6, 'no-ground'],
  ] as const) {
    const bad = arena([arenaFish('sprat', { x: 0, y: 1, z: 0 }, 0, 'carried')], { position, yaw, pitch });
    const before = bad.getState().fish; const rng = bad.getState().fishRngState;
    assert.equal(bad.dispatch({ type: 'interact' }).reason, expected); assert.deepEqual(bad.getState().fish, before);
    assert.equal(bad.getState().fishRngState, rng);
  }
});

test('all species start after their full interval, warn for .2s and jump .4s/.4m with exact distance', () => {
  for (const [species, intervalTicks, distance] of [['sprat',108,.9], ['bass',84,1.2], ['tuna',72,1.4], ['golden',54,1.8]] as const) {
    const game = arena([arenaFish(species)]); game.advanceTicks(intervalTicks - 13);
    assert.equal(game.getState().fish[0].jumpPhase, 'idle'); game.advanceTicks(1);
    assert.equal(game.getState().fish[0].jumpPhase, 'warning'); game.advanceTicks(11);
    assert.deepEqual(game.getState().fish[0].position, { x: 0, y: 1, z: 5 }); game.advanceTicks(1);
    assert.equal(game.getState().fish[0].jumpPhase, 'jumping'); close(game.getState().fish[0].jumpTimer, 0);
    game.advanceTicks(12); const mid = game.getState().fish[0]; close(mid.position.y, 1.4); close(mid.position.z, 5 + distance / 2);
    game.advanceTicks(12); const end = game.getState().fish[0]; close(end.position.y, 1); close(end.position.z, 5 + distance);
    close(end.jumpTimer, .4); assert.equal(end.jumpPhase, 'idle');
    game.advanceTicks(intervalTicks - 25); assert.notEqual(game.getState().fish[0].jumpPhase, 'jumping');
    game.advanceTicks(1); assert.equal(game.getState().fish[0].jumpPhase, 'jumping');
  }
});

test('each launch chooses nearest coast, center ties +Z, shop sweep blocks tunnelling', () => {
  for (const [position, axis, sign] of [[{ x: 0, y: 1, z: 0 }, 'z', 1], [{ x: 8, y: 1, z: 0 }, 'x', 1],
    [{ x: -8, y: 1, z: 0 }, 'x', -1], [{ x: 0, y: 1, z: -8 }, 'z', -1]] as const) {
    const game = arena([arenaFish('sprat', position)]); game.advanceTicks(132);
    close(game.getState().fish[0].position[axis], position[axis] + .9 * sign);
  }
  const blocked = arena([arenaFish('golden', { x: -4, y: 1, z: 0 })]); blocked.advanceTicks(78);
  const stop = blocked.getState().fish[0].position; assert.ok(stop.x >= -4.3 - 1e-6); close(stop.y, 1);
  blocked.advanceTicks(54); close(blocked.getState().fish[0].position.x, stop.x);
  assert.equal(blocked.getState().fish[0].state, 'groundedAlive');
});

test('water-center crossing escapes once, removes entity and preserves detached terminal record', () => {
  const game = arena([arenaFish('sprat', { x: 0, y: 1, z: 9.7 })]); game.advanceTicks(132);
  assert.equal(game.getState().fish.length, 0); assert.equal(game.getState().terminalFish.length, 1);
  assert.equal(game.getState().terminalFish[0].state, 'escaped'); assert.ok(game.getState().terminalFish[0].position.z > 10);
  const escape = game.getState().events.filter(event => event.type === 'fish_escape'); assert.equal(escape.length, 1);
  assert.equal(escape[0].entityId, 'test-fish'); game.advanceTicks(3600);
  assert.equal(game.dispatch({ type: 'interact' }).accepted, false);
  assert.equal(game.getState().events.filter(event => event.type === 'fish_escape').length, 1); assert.equal(game.getState().coins, 0);
  const snapshot = game.getState(); snapshot.terminalFish[0].position.z = 99; assert.notEqual(game.getState().terminalFish[0].position.z, 99);
});

test('grounded jumping and carried fish freeze during pause without replaying elapsed time', () => {
  const game = arena(); game.advanceTicks(120); game.dispatch({ type: 'pause' }); const paused = game.getState();
  game.advanceTicks(300); assert.deepEqual(game.getState(), paused); assert.equal(game.dispatch({ type: 'interact' }).reason, 'paused');
  game.dispatch({ type: 'resume' }); game.advanceTicks(12); close(game.getState().fish[0].position.y, 1); close(game.getState().fish[0].position.z, 5.9);
  const carried = arena([arenaFish('golden', { x: 0, y: 1, z: 0 }, 0, 'carried')]); const first = carried.getState().fish[0];
  carried.advanceTicks(500); assert.deepEqual(carried.getState().fish[0], first);
  carried.dispatch({ type: 'pause' }); const held = carried.getState(); carried.advanceTicks(300); assert.deepEqual(carried.getState(), held);
});

test('real caught fish can be placed and another catch can coexist without IDs or RNG corruption', () => {
  const game = startReeling(); const caught = landWithRealInputs(game); const id = caught.fish[0].id;
  game.dispatch({ type: 'look', yaw: Math.PI, pitch: -.6 }); assert.equal(game.dispatch({ type: 'interact' }).accepted, true);
  game.dispatch({ type: 'look', yaw: 0, pitch: 0 }); hook(game); const second = landWithRealInputs(game);
  assert.ok(second.fish.some(fish => fish.state === 'carried')); assert.ok(second.fish.some(fish => fish.id === id) || second.terminalFish.some(fish => fish.id === id));
  assert.equal(new Set([...second.fish, ...second.terminalFish].map(fish => fish.id)).size, second.fish.length + second.terminalFish.length);
  assert.equal(second.events.filter(event => event.type === 'landing').length, 2);
});

test('normal island fish use radial nearest exits and can escape through unobstructed shore routes', async () => {
  const { makeWorld } = await import('../src/game/world.ts');
  const { createLiveFish, nearestCoastDirection, stepLiveFish } = await import('../src/game/fish-life.ts');
  const world = makeWorld('island');
  assert.deepEqual(nearestCoastDirection(world, { x: 0, y: 1, z: 0 }), { x: 0, z: 1 });
  const fish = createLiveFish(arenaFish('sprat', { x: 12, y: 1, z: 12 }) as import('../src/game/types.ts').InitialFish);
  for (let tick = 0; tick < 132; tick++) assert.equal(stepLiveFish(world, fish), false);
  close(fish.position.x, 12 + .9 / Math.sqrt(2)); close(fish.position.z, 12 + .9 / Math.sqrt(2));
  let escaped = false;
  for (let tick = 0; tick < 2000 && !escaped; tick++) escaped = stepLiveFish(world, fish);
  assert.equal(escaped, true); assert.ok(Math.hypot(fish.position.x, fish.position.z) > 23);
});

test('live render follows production positions, reuses models and releases reset/escaped objects', async () => {
  const THREE = await import('three'); const { LiveFishView } = await import('../src/render/live-fish-view.ts');
  const scene = new THREE.Scene(); const view = new LiveFishView(scene); const game = arena();
  view.update(game.getState()); const object = scene.getObjectByName('live-fixture-fish-1')!;
  assert.ok(object); game.advanceTicks(120); view.update(game.getState());
  assert.equal(scene.getObjectByName('live-fixture-fish-1'), object); close(object.position.y, 1.4); close(object.position.z, -5.45);
  let disposed = 0; object.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.addEventListener('dispose', () => disposed++); });
  view.reset(); assert.equal(scene.getObjectByName('live-fixture-fish-1'), undefined); assert.ok(disposed > 0);
  game.reset({ seed: 1, fixture: 'fish-arena', initial: { fish: [arenaFish('sprat', { x: 0, y: 1, z: 9.7 })] } });
  view.update(game.getState()); assert.ok(scene.getObjectByName('live-test-fish')); game.advanceTicks(132); view.update(game.getState());
  assert.equal(scene.getObjectByName('live-test-fish'), undefined); view.dispose(); assert.equal(scene.getObjectByName('live-fish'), undefined);
});

const combatArena = (fish?: unknown[], player?: unknown) => { const game = arena(fish, player); game.dispatch({ type: 'setMode', mode: 'combat' }); return game; };
const punch = (game: Game) => game.dispatch({ type: 'primaryDown' });
const combatFish = (species = 'sprat', position = { x: 0, y: 1, z: 5 }, hp?: number, state = 'groundedAlive', id = 'target') =>
  ({ ...arenaFish(species, position, 0, state, id), ...(hp === undefined ? {} : { hp }) });

test('fish HP defaults match species and dead/invalid HP initialization is validated atomically', () => {
  const game = arena(['sprat','bass','tuna','golden'].map((species, index) => combatFish(species, { x: index, y: 1, z: 5 }, undefined, 'groundedAlive', species)));
  assert.deepEqual(game.getState().fish.map(fish => fish.hp), [20,45,90,150]);
  const dead = arena([combatFish('sprat', { x: 0, y: 1, z: 5 }, 0, 'groundedDead')]);
  assert.equal(dead.getState().fish[0].state, 'groundedDead'); dead.advanceTicks(500); close(dead.getState().fish[0].position.y, 1);
  for (const [hp, state] of [[0,'groundedAlive'],[-1,'groundedAlive'],[21,'groundedAlive'],[NaN,'groundedAlive'],[Infinity,'groundedAlive'],[null,'groundedAlive'],['10','groundedAlive'],[10,'groundedDead'],[undefined,'groundedDead']] as const) {
    const before = game.getState(); assert.throws(() => game.reset({ seed: 9, fixture: 'fish-arena', initial: { fish: [combatFish('sprat', undefined, hp, state)] } }));
    assert.deepEqual(game.getState(), before);
  }
});

test('punch deals ten, takes exactly 27 ticks cooldown, and holding/misses do not bypass it', () => {
  const game = combatArena(); assert.equal(punch(game).accepted, true); assert.equal(game.getState().fish[0].hp, 10);
  close(game.getState().attackCooldownRemaining, .45); assert.equal(punch(game).reason, 'attack-cooldown');
  for (let i = 0; i < 26; i++) { game.advanceTicks(1); assert.equal(punch(game).accepted, false); }
  assert.equal(game.getState().fish[0].hp, 10); game.advanceTicks(1); assert.equal(game.getState().attackCooldownRemaining, 0);
  assert.equal(punch(game).accepted, true); assert.equal(game.getState().fish[0].hp, 0); assert.equal(game.getState().fish[0].state, 'groundedDead');
  assert.equal(game.getState().events.filter(event => event.type === 'fish_damage').length, 2);
  const held = combatArena([combatFish('tuna')]); punch(held); held.advanceTicks(60); assert.equal(held.getState().fish[0].hp, 80);
  const miss = combatArena([]); assert.equal(punch(miss).accepted, true); close(miss.getState().attackCooldownRemaining, .45);
  assert.equal(punch(miss).accepted, false); miss.dispatch({ type: 'pause' }); const paused = miss.getState();
  miss.advanceTicks(300); assert.deepEqual(miss.getState(), paused); miss.dispatch({ type: 'resume' }); miss.advanceTicks(27);
  assert.equal(punch(miss).accepted, true);
});

test('combat selects only nearest visible alive fish within angle, collider range and height', () => {
  const game = combatArena([
    combatFish('bass', { x: 0, y: 1, z: 5.2 }, undefined, 'groundedAlive', 'far'),
    combatFish('sprat', { x: 0, y: 1, z: 5 }, undefined, 'groundedAlive', 'near'),
    combatFish('tuna', { x: 0, y: 1, z: 2 }, undefined, 'groundedAlive', 'behind'),
    combatFish('golden', { x: 0, y: 1, z: 4.2 }, 0, 'groundedDead', 'dead'),
    combatFish('bass', { x: 0, y: 1, z: 4 }, undefined, 'carried', 'held'),
  ]); punch(game); const hp = Object.fromEntries(game.getState().fish.map(fish => [fish.id, fish.hp]));
  assert.deepEqual(hp, { far:45, near:10, behind:90, dead:0, held:45 });
  for (const [fishPosition, player, expectedHit] of [
    [{ x: 0, y: 1, z: 5.58 }, { position: { x: 0, y: 1, z: 3.5 } }, true],
    [{ x: 0, y: 1, z: 5.60 }, { position: { x: 0, y: 1, z: 3.5 } }, false],
    [{ x: 1, y: 1, z: 4.5 }, { position: { x: 0, y: 1, z: 3.5 } }, true],
    [{ x: 1.1, y: 1, z: 4.5 }, { position: { x: 0, y: 1, z: 3.5 } }, false],
    [{ x: 0, y: 1, z: 2 }, { position: { x: 0, y: 1, z: 3.5 } }, false],
    [{ x: 0, y: 1, z: 5 }, { position: { x: 0, y: 2.6, z: 3.5 } }, false],
    [{ x: 0, y: 1, z: 4.5 }, { position: { x: 0, y: 1.8, z: 3.5 } }, true],
    [{ x: 0, y: 1, z: 4.5 }, { position: { x: 0, y: 1.81, z: 3.5 } }, false],
    [{ x: -5, y: 1, z: 1.72 }, { position: { x: -4.1, y: 1, z: .9 }, yaw: Math.atan2(-.9,.82) }, false],
  ] as const) {
    const candidate = combatArena([combatFish('sprat', fishPosition)], player); punch(candidate);
    assert.equal(candidate.getState().fish[0].hp, expectedHit ? 10 : 20);
  }
});

test('knockback follows player forward, stops against shop and escapes only live fish', () => {
  for (const yaw of [0, Math.PI/2, Math.PI, -Math.PI/2]) {
    const p = { x: Math.sin(yaw)*1.5, y: 1, z: 3.5+Math.cos(yaw)*1.5 };
    const game = combatArena([combatFish('bass', p)], { yaw }); punch(game); const position = game.getState().fish[0].position;
    close(position.x, p.x+Math.sin(yaw)*.1); close(position.z, p.z+Math.cos(yaw)*.1);
  }
  const blocked = combatArena([combatFish('sprat', { x:-4.25,y:1,z:0 })], { position:{ x:-2.8,y:1,z:0 }, yaw:-Math.PI/2 });
  punch(blocked); assert.ok(blocked.getState().fish[0].position.x >= -4.300001); assert.equal(blocked.getState().fish[0].hp,10);
  const sea = combatArena([combatFish('sprat', {x:0,y:1,z:9.99},20)], {position:{x:0,y:1,z:9.1},yaw:0}); punch(sea); sea.advanceTicks(1);
  assert.equal(sea.getState().fish.length,0); assert.equal(sea.getState().terminalFish[0].state,'escaped');
  assert.equal(sea.getState().events.filter(event=>event.type==='fish_death').length,0);
});

test('death keeps one grounded corpse, stops jumping and prevents repeated damage or death', () => {
  const game = combatArena([combatFish('sprat', {x:0,y:1,z:5},10)]); game.advanceTicks(120); punch(game);
  const dead = game.getState().fish[0]; assert.equal(dead.state,'groundedDead'); assert.equal(dead.hp,0); close(dead.position.y,1);
  game.advanceTicks(1000); assert.deepEqual(game.getState().fish[0],dead);
  punch(game); game.advanceTicks(27); punch(game); assert.deepEqual(game.getState().fish[0],dead);
  assert.equal(game.getState().events.filter(event=>event.type==='fish_death').length,1);
  assert.equal(game.getState().events.filter(event=>event.type==='fish_damage').length,1);
  assert.equal(game.getState().terminalFish.length,0); assert.equal(game.getState().coins,0);
});

test('attack before same-step escape keeps a shore corpse; no attack escapes instead', () => {
  for (const attacked of [true,false]) {
    const initial = {...combatFish('sprat',{x:0,y:1,z:9.99},10),jumpTimer:1.8-1/60};
    const game = combatArena([initial],{position:{x:0,y:1,z:9.1},yaw:0}); game.advanceTicks(1);
    assert.equal(game.getState().fish[0].jumpPhase,'jumping'); if(attacked) punch(game); game.advanceTicks(1);
    const state=game.getState();
    if(attacked) {
      assert.equal(state.fish.length,1); assert.equal(state.fish[0].state,'groundedDead'); assert.ok(state.fish[0].position.z<=9.8+1e-6);
      assert.equal(state.terminalFish.length,0); assert.equal(state.events.filter(event=>event.type==='fish_death').length,1);
      assert.equal(state.events.filter(event=>event.type==='fish_escape').length,0);
    } else { assert.equal(state.fish.length,0); assert.equal(state.terminalFish.length,1); }
  }
});

test('combat rejects target/damage injection atomically and cannot damage carried/dead or pause', () => {
  const game=combatArena([combatFish('sprat')]); const before=game.getState();
  for(const action of [{type:'primaryDown',targetId:'fixture-fish-1'},{type:'primaryDown',damage:100},{type:'primaryDown',success:true}]) {
    assert.equal(game.dispatch(action).accepted,false); assert.deepEqual(game.getState().fish,before.fish); assert.equal(game.getState().attackCooldownRemaining,0);
  }
  game.dispatch({type:'pause'}); assert.equal(punch(game).reason,'paused'); assert.equal(game.getState().attackCooldownRemaining,0);
  const carried=combatArena([combatFish('sprat',undefined,undefined,'carried')]); punch(carried); assert.equal(carried.getState().fish[0].hp,20);
  assert.equal(carried.getState().events.filter(event=>event.type==='fish_damage').length,0);
});

test('placing a partly injured carried fish preserves HP and the same entity', () => {
  const game = arena([combatFish('bass', undefined, 17, 'carried', 'injured')]);
  assert.equal(game.dispatch({ type: 'interact' }).accepted, true);
  const fish = game.getState().fish[0];
  assert.equal(fish.id, 'injured'); assert.equal(fish.hp, 17); assert.equal(fish.state, 'groundedAlive');
  game.dispatch({ type: 'setMode', mode: 'combat' }); punch(game);
  assert.equal(game.getState().fish[0].hp, 7);
});

test('normal island lethal knockback returns a corpse to the nearest radial bank and freezes it', async () => {
  const { makeWorld } = await import('../src/game/world.ts');
  const { createLiveFish, stepLiveFish } = await import('../src/game/fish-life.ts');
  const { punchFish } = await import('../src/game/combat.ts');
  const world = makeWorld('island'); const angle = Math.PI / 4;
  const fish = createLiveFish({ id:'radial', species:'sprat', state:'groundedAlive', hp:10,
    position:{ x:Math.sin(angle)*22.99, y:1, z:Math.cos(angle)*22.99 }, jumpTimer:0 });
  const player = { position:{ x:Math.sin(angle)*22, y:1, z:Math.cos(angle)*22 }, yaw:angle, pitch:-.6, hp:100, hunger:100 };
  assert.equal(punchFish(world, fish, player), true);
  assert.equal(fish.state, 'groundedDead'); close(Math.hypot(fish.position.x, fish.position.z), 22.8);
  close(fish.position.x, fish.position.z); close(fish.position.y, 1);
  const corpse = structuredClone(fish);
  for(let tick=0;tick<1000;tick++) assert.equal(stepLiveFish(world, fish), false);
  assert.deepEqual(fish, corpse);
});

const storedFish = (id = 'food', species = 'sprat') => ({ id, species });
const survivalGame = (hp = 100, hunger = 100, inventory: unknown[] = [], fish: unknown[] = []) => {
  const game = new Game(); game.reset({ seed:1, fixture:'shore', initial:{ player:{hp,hunger}, inventory, fish } }); return game;
};
const eat = (game: Game, fishId = 'food') => game.dispatch({type:'eat',fishId});

test('survival reset validates vitals, inventory capacity and cross-location IDs atomically', () => {
  const game = survivalGame(80,90,[storedFish()]); const state=game.getState();
  assert.equal(state.player.hp,80); assert.equal(state.player.hunger,90); assert.equal(state.inventory[0].state,'inventoryDead');
  state.inventory[0].id='changed'; assert.equal(game.getState().inventory[0].id,'food');
  for(const initial of [
    {player:{hp:-1}}, {player:{hp:101}}, {player:{hunger:NaN}}, {player:{hp:'80'}}, {player:{hunger:null}},
    {inventory:null}, {inventory:[storedFish(),storedFish()]}, {inventory:[storedFish('x','shark')]},
    {inventory:[{...storedFish(),state:'groundedAlive'}]}, {inventory:Array.from({length:11},(_,i)=>storedFish(`i${i}`))},
    {inventory:[storedFish('same')],fish:[combatFish('sprat',{x:0,y:1,z:1},0,'groundedDead','same')]},
  ]) {
    const before=game.getState(); assert.throws(()=>game.reset({seed:2,fixture:'shore',initial})); assert.deepEqual(game.getState(),before);
  }
});

test('E production interaction transfers ten unique corpses and leaves the eleventh on full inventory', () => {
  const bodies=Array.from({length:11},(_,i)=>combatFish('sprat',{x:0,y:1,z:1+i*.05},0,'groundedDead',`body-${i}`));
  const game=survivalGame(100,50,[],bodies);
  for(let i=0;i<10;i++) assert.equal(game.dispatch({type:'interact'}).accepted,true);
  const full=game.getState(); assert.equal(full.inventory.length,10); assert.equal(full.fish.length,1);
  assert.equal(full.fish[0].id,'body-10'); assert.equal(game.dispatch({type:'interact'}).reason,'inventory-full');
  assert.deepEqual(game.getState().inventory,full.inventory); assert.deepEqual(game.getState().fish,full.fish);
  assert.equal(new Set(full.inventory.map(item=>item.id)).size,10);
  assert.equal(full.events.filter(event=>event.type==='inventory').length,10);
  game.dispatch({type:'openInventory'}); eat(game,'body-0'); game.dispatch({type:'closeInventory'});
  assert.equal(game.getState().inventory.length,9);
  assert.equal(game.dispatch({type:'interact'}).accepted,true); // A consumed slot can accept the previously rejected corpse.
  assert.equal(game.getState().inventory.length,10); assert.equal(game.getState().fish.length,0);
  assert.equal(game.getState().consumedFish[0].id,'body-0');
});

test('corpse pickup uses actual two metre range and obstruction, excludes live/terminal/repeated IDs', () => {
  for(const [z,accepted] of [[2,true],[2.001,false]] as const) {
    const game=survivalGame(100,100,[],[combatFish('sprat',{x:0,y:1,z},0,'groundedDead')]);
    assert.equal(game.dispatch({type:'interact'}).accepted,accepted);
    assert.equal(game.getState().inventory.length,accepted?1:0);
    if(accepted) { assert.equal(game.dispatch({type:'interact'}).accepted,false); assert.equal(game.getState().inventory.length,1); }
  }
  const live=survivalGame(100,100,[],[combatFish('sprat',{x:0,y:1,z:1})]);
  assert.equal(live.dispatch({type:'interact'}).accepted,false); assert.equal(live.getState().inventory.length,0);
  const blocked=arena([combatFish('sprat',{x:-5,y:1,z:1.72},0,'groundedDead')],{position:{x:-4.1,y:1,z:.9}});
  assert.equal(blocked.dispatch({type:'interact'}).accepted,false); assert.equal(blocked.getState().inventory.length,0);
  const escaped=combatArena([combatFish('sprat',{x:0,y:1,z:9.99},20)],{position:{x:0,y:1,z:9.1},yaw:0});
  punch(escaped); assert.equal(escaped.getState().terminalFish.length,1);
  assert.equal(escaped.dispatch({type:'interact'}).accepted,false); assert.equal(escaped.getState().inventory.length,0);
  assert.equal(live.dispatch({type:'interact',fishId:'target'}).accepted,false);
});

test('food restores species hunger only, consumes once, clamps at 100 and full hunger keeps the item', () => {
  for(const [species,recovery] of [['sprat',12],['bass',20],['tuna',30],['golden',40]] as const) {
    const game=survivalGame(80,40,[storedFish('food',species)]); assert.equal(eat(game).accepted,true);
    assert.equal(game.getState().player.hunger,40+recovery); assert.equal(game.getState().player.hp,80);
    assert.equal(game.getState().inventory.length,0); assert.equal(game.getState().consumedFish[0].state,'consumed');
    assert.equal(eat(game).accepted,false); assert.equal(game.getState().events.filter(event=>event.type==='eat').length,1);
  }
  const game=survivalGame(80,90,[storedFish(),storedFish('other')]);
  assert.equal(eat(game).accepted,true); assert.equal(game.getState().player.hunger,100); assert.equal(game.getState().player.hp,80);
  assert.equal(eat(game,'other').reason,'hunger-full'); assert.equal(game.getState().inventory.length,1);
  const before=game.getState().inventory;
  assert.equal(game.dispatch({type:'eat',fishId:'other',hunger:0}).accepted,false); assert.deepEqual(game.getState().inventory,before);
  assert.equal(eat(game,'alive').accepted,false);
});

test('hunger updates before strict low-hunger damage with exact boundary and food precedes the next step', () => {
  const high=survivalGame(100,21); high.advanceTicks(60); close(high.getState().player.hunger,20.5); close(high.getState().player.hp,100);
  const low=survivalGame(80,19.5); low.advanceTicks(60); close(low.getState().player.hunger,19); close(low.getState().player.hp,78);
  const boundary=survivalGame(100,21); boundary.advanceTicks(120);
  close(boundary.getState().player.hunger,20); close(boundary.getState().player.hp,100); boundary.advanceTicks(1);
  close(boundary.getState().player.hunger,20-1/120); close(boundary.getState().player.hp,100-1/30);
  const zero=survivalGame(100,0); zero.advanceTicks(60); close(zero.getState().player.hunger,0); close(zero.getState().player.hp,98);
  const saved=survivalGame(1,19.5,[storedFish()]); eat(saved); saved.advanceTicks(60);
  close(saved.getState().player.hunger,31); close(saved.getState().player.hp,1); assert.equal(saved.getState().gamePhase,'running');
});

test('inventory menu freezes every timer, permits food, rejects gameplay and releases inputs on close', () => {
  const game=survivalGame(80,10,[storedFish()],[combatFish('sprat',{x:0,y:1,z:5})]);
  move(game,1); game.advanceTicks(1); game.dispatch({type:'openInventory'});
  const opened=game.getState(); assert.equal(opened.gamePhase,'paused'); assert.equal(opened.ui.menu,'inventory');
  game.advanceTicks(300); assert.deepEqual(game.getState(),opened);
  assert.equal(game.dispatch({type:'resume'}).accepted,false);
  for(const action of [{type:'move',forward:1,strafe:0,sprint:true},{type:'jump'},{type:'interact'},{type:'primaryDown'},{type:'setMode',mode:'combat'}]) assert.equal(game.dispatch(action).accepted,false);
  assert.equal(eat(game).accepted,true); const eaten=game.getState(); close(eaten.player.hunger,opened.player.hunger+12); close(eaten.player.hp,opened.player.hp);
  game.advanceTicks(300); assert.deepEqual(game.getState(),eaten); game.dispatch({type:'closeInventory'}); game.advanceTicks(60);
  assert.equal(game.getState().gamePhase,'running'); assert.deepEqual(game.getState().player.position,opened.player.position);
  game.dispatch({type:'openInventory'}); game.dispatch({type:'pause'}); game.dispatch({type:'closeInventory'});
  assert.equal(game.getState().gamePhase,'paused'); assert.equal(game.getState().ui.menu,'pause');
  game.dispatch({type:'openInventory'}); game.dispatch({type:'closeInventory'}); assert.equal(game.getState().gamePhase,'paused');
});

test('HP zero produces one game over, freezes the dead session and only confirmed restart recovers', () => {
  const game=survivalGame(1,0,[storedFish()]); move(game,1); game.advanceTicks(30);
  const dead=game.getState(); assert.equal(dead.player.hp,0); assert.equal(dead.gamePhase,'dead'); assert.equal(dead.ui.menu,'dead'); assert.equal(dead.simulationTick,30);
  assert.equal(dead.events.filter(event=>event.type==='game_over').length,1); assert.equal(dead.events.filter(event=>event.type==='player_damage').length,30);
  game.advanceTicks(300); assert.deepEqual(game.getState(),dead);
  for(const action of [{type:'resume'},{type:'pause'},{type:'openInventory'},{type:'closeInventory'},{type:'eat',fishId:'food'},{type:'interact'},{type:'jump'},{type:'primaryDown'},{type:'move',forward:1,strafe:0,sprint:true}]) assert.equal(game.dispatch(action).accepted,false);
  assert.equal(game.dispatch({type:'restart',confirm:false}).accepted,false); assert.equal(game.getState().gamePhase,'dead');
  assert.equal(game.dispatch({type:'restart',confirm:true}).accepted,true);
  const fresh=game.getState(); assert.equal(fresh.gamePhase,'running'); assert.equal(fresh.player.hp,100); assert.equal(fresh.player.hunger,100); assert.equal(fresh.coins,0); assert.equal(fresh.mode,'combat');
  assert.deepEqual(fresh.inventory,[]); assert.deepEqual(fresh.fish,[]); assert.deepEqual(fresh.consumedFish,[]); assert.equal(fresh.attackCooldownRemaining,0);
  assert.equal(fresh.events.filter(event=>event.type==='restart').length,1); game.advanceTicks(60); assert.deepEqual(game.getState().player.position,fresh.player.position);
  const initiallyDead=survivalGame(0,100); assert.equal(initiallyDead.getState().gamePhase,'dead'); initiallyDead.advanceTicks(60); assert.equal(initiallyDead.getState().simulationTick,0);
});

test('inventory IDs reserve real catch IDs and food is usable during ordinary pause', () => {
  const game=new Game(); game.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9},hunger:50},inventory:[storedFish('fish-1-1')]} });
  hook(game); const landed=landWithRealInputs(game); assert.equal(landed.fish[0].id,'fish-1-2'); assert.equal(landed.inventory[0].id,'fish-1-1');
  game.dispatch({type:'pause'}); const hp=game.getState().player.hp; assert.equal(eat(game,'fish-1-1').accepted,true);
  assert.equal(game.getState().player.hp,hp); assert.equal(game.getState().gamePhase,'paused'); assert.equal(game.getState().inventory.length,0);
});

test('inventory also freezes charge and active reel sessions; closing never restores held fishing input', () => {
  const charging=northShore(); charging.dispatch({type:'primaryDown'}); charging.advanceTicks(30);
  charging.dispatch({type:'openInventory'}); const frozenCharge=charging.getState(); charging.advanceTicks(300); assert.deepEqual(charging.getState(),frozenCharge);
  charging.dispatch({type:'closeInventory'}); charging.advanceTicks(60); close(charging.getState().fishing.chargeSeconds,.5);
  charging.dispatch({type:'primaryDown'}); charging.advanceTicks(30); close(charging.getState().fishing.chargeSeconds,1);
  const reel=startReeling(); reel.advanceTicks(12); reel.dispatch({type:'openInventory'}); const paused=reel.getState();
  reel.advanceTicks(300); assert.deepEqual(reel.getState(),paused); assert.equal(paused.fishing.holding,false);
  reel.dispatch({type:'closeInventory'}); reel.advanceTicks(6); const after=reel.getState();
  close(after.fishing.progress,paused.fishing.progress); close(after.fishing.tension,paused.fishing.tension-2);
  assert.equal(after.fishRngState,paused.fishRngState); assert.equal(after.fishing.cast!.id,paused.fishing.cast!.id);
});

const tradeGame = (inventory: unknown[] = [storedFish('trade-1','bass')], player: unknown = {position:{x:-6,y:1,z:-2}}, coins: unknown = 20) => {
  const game = new Game(); game.reset({seed:1,fixture:'shore',initial:{player,coins,inventory}}); return game;
};
const sell = (game: Game, fishId = 'trade-1') => game.dispatch({type:'sell',fishId});

test('coins reset validates finite nonnegative integers atomically and restart clears balance', () => {
  const game=tradeGame(); assert.equal(game.getState().coins,20);
  for(const coins of [-1,.5,NaN,Infinity,null,'20']) {
    const before=game.getState(); assert.throws(()=>game.reset({seed:1,fixture:'shore',initial:{coins}})); assert.deepEqual(game.getState(),before);
  }
  game.dispatch({type:'restart',confirm:true}); assert.equal(game.getState().coins,0);
});

test('shop open and E use the actual front counter range and reject distance, wall occlusion and injected success', () => {
  for(const [position,accepted] of [[{x:-6,y:1,z:-3.55},true],[{x:-6,y:1,z:-3.56},false],
    [{x:-4.1,y:1,z:-1},false],[{x:-6,y:1,z:1.9},false],[{x:-6,y:4,z:-2},false]] as const) {
    const game=tradeGame([], {position}); const before=game.getState();
    assert.equal(game.dispatch({type:'openShop'}).accepted,accepted);
    if(accepted) { assert.equal(game.getState().ui.menu,'shop'); game.dispatch({type:'closeShop'}); assert.equal(game.dispatch({type:'interact'}).accepted,true); assert.equal(game.getState().ui.menu,'shop'); }
    else { assert.equal(game.getState().ui.menu,'none'); assert.deepEqual(game.getState().player,before.player); assert.equal(game.getState().coins,before.coins); }
  }
  const game=tradeGame(); assert.equal(game.dispatch({type:'openShop',success:true}).accepted,false); assert.equal(game.getState().ui.menu,'none');
  const far=tradeGame([],{position:{x:0,y:1,z:0}}); assert.equal(far.dispatch({type:'interact'}).accepted,false); assert.equal(far.getState().ui.menu,'none');
});

test('four corpse sales use exact prices and preserve every unrelated item and survival value', () => {
  for(const [species,price] of [['sprat',8],['bass',20],['tuna',45],['golden',120]] as const) {
    const game=tradeGame([storedFish('trade-1',species),storedFish('other','golden')],{position:{x:-6,y:1,z:-2},hp:80,hunger:19.5});
    game.dispatch({type:'openShop'}); const before=game.getState(); assert.equal(sell(game).accepted,true); const after=game.getState();
    assert.equal(after.coins,20+price); assert.deepEqual(after.inventory,[before.inventory[1]]); assert.deepEqual(after.player,before.player);
    assert.deepEqual(after.fish,before.fish); assert.deepEqual(after.consumedFish,[]);
    assert.equal(after.terminalFish[0].id,'trade-1'); assert.equal(after.terminalFish[0].state,'sold'); assert.equal(after.terminalFish[0].price,price);
    assert.equal(after.events.filter(event=>event.type==='sell').length,1);
  }
});

test('a corpse can be sold or eaten only once and stale, live, carried and escaped selections never reward', () => {
  const sold=tradeGame(); sold.dispatch({type:'openShop'}); assert.equal(sell(sold).accepted,true); assert.equal(sold.getState().coins,40);
  const after=sold.getState(); assert.equal(sell(sold).accepted,false); assert.equal(eat(sold,'trade-1').accepted,false);
  assert.equal(sold.getState().coins,40); assert.deepEqual(sold.getState().player,after.player); assert.deepEqual(sold.getState().terminalFish,after.terminalFish);
  const eaten=tradeGame(undefined,{position:{x:-6,y:1,z:-2},hunger:50}); eat(eaten,'trade-1'); eaten.dispatch({type:'openShop'});
  assert.equal(sell(eaten).accepted,false); assert.equal(eaten.getState().coins,20); assert.equal(eaten.getState().player.hunger,70);
  const invalid=tradeGame([]); invalid.dispatch({type:'openShop'});
  for(const id of ['alive','carried','escaped','', 'expired']) assert.equal(sell(invalid,id).accepted,false);
  assert.equal(invalid.getState().coins,20); assert.equal(invalid.getState().inventory.length,0); assert.equal(invalid.getState().terminalFish.length,0);
  const targets=new Game(); targets.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-2}},fish:[
    combatFish('sprat',{x:0,y:1,z:0},undefined,'carried','carried'),combatFish('sprat',{x:0,y:1,z:9.99},undefined,'groundedAlive','alive'),
  ]}}); targets.advanceTicks(109); targets.dispatch({type:'openShop'}); assert.equal(sell(targets,'carried').accepted,false); assert.equal(sell(targets,'alive').accepted,false);
  assert.equal(targets.getState().coins,0); assert.equal(targets.getState().fish[0].state,'carried');
  const copy=sold.getState(); copy.terminalFish[0].id='changed'; assert.equal(sold.getState().terminalFish[0].id,'trade-1');
});

test('sales require the shop menu, reject price injection and overflow atomically, and reject invalid buying', () => {
  const game=tradeGame(); assert.equal(sell(game).accepted,false); assert.equal(game.getState().coins,20); game.dispatch({type:'openShop'});
  const before=game.getState();
  for(const action of [{type:'sell',fishId:'trade-1',price:1000},{type:'sell',fishId:'trade-1',coins:1000},{type:'sell'},{type:'sell',fishId:1},{type:'buy',weapon:'gun'}]) assert.equal(game.dispatch(action).accepted,false);
  assert.deepEqual(game.getState().inventory,before.inventory); assert.equal(game.getState().coins,20);
  const huge=tradeGame([storedFish('trade-1','tuna')],undefined,Number.MAX_VALUE); huge.dispatch({type:'openShop'});
  assert.equal(sell(huge).accepted,false); assert.equal(huge.getState().coins,Number.MAX_VALUE); assert.equal(huge.getState().inventory.length,1);
});

test('shop freezes all timers, preserves fish and held-input release, and cannot bypass focus pause or other menus', () => {
  const game=new Game(); game.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-2},hp:80,hunger:19.5},fish:[combatFish('sprat',{x:0,y:1,z:5})]}});
  game.dispatch({type:'setMode',mode:'combat'}); punch(game); move(game,-1); game.dispatch({type:'openShop'}); const paused=game.getState();
  game.advanceTicks(600); assert.deepEqual(game.getState(),paused); assert.equal(game.dispatch({type:'resume'}).accepted,false);
  assert.equal(game.dispatch({type:'openInventory'}).accepted,false); assert.equal(game.dispatch({type:'closeInventory'}).accepted,false);
  game.dispatch({type:'closeShop'}); game.advanceTicks(1); const resumed=game.getState();
  assert.equal(resumed.gamePhase,'running'); assert.deepEqual(resumed.player.position,paused.player.position); close(resumed.player.hunger,19.5-1/120); close(resumed.attackCooldownRemaining,.45-1/60);
  game.dispatch({type:'openShop'}); game.dispatch({type:'pause'}); game.dispatch({type:'closeShop'}); assert.equal(game.getState().gamePhase,'paused');
  game.dispatch({type:'openShop'}); game.dispatch({type:'closeShop'}); assert.equal(game.getState().gamePhase,'paused');
  game.dispatch({type:'openInventory'}); assert.equal(game.dispatch({type:'openShop'}).accepted,false); assert.equal(game.dispatch({type:'closeShop'}).accepted,false);
});

test('shop preserves active fishing and carried fish; opening does not place, duplicate or cancel them', () => {
  const game=new Game(); game.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-3},yaw:Math.PI,pitch:0}}});
  cast(game,60); game.advanceTicks(120); game.dispatch({type:'primaryDown'}); game.advanceTicks(12);
  assert.equal(game.getState().fishing.phase,'reeling'); game.dispatch({type:'openShop'}); const frozen=game.getState(); game.advanceTicks(600); assert.deepEqual(game.getState(),frozen);
  game.dispatch({type:'closeShop'}); game.advanceTicks(6); close(game.getState().fishing.tension,frozen.fishing.tension-2);
  assert.equal(game.getState().fishRngState,frozen.fishRngState); assert.equal(game.getState().fishing.cast!.id,frozen.fishing.cast!.id);
  const held=new Game(); held.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-2}},fish:[combatFish('sprat',undefined,undefined,'carried','held')]}});
  const fish=held.getState().fish; assert.equal(held.dispatch({type:'interact'}).accepted,true); assert.equal(held.getState().ui.menu,'shop'); assert.deepEqual(held.getState().fish,fish);
  held.dispatch({type:'closeShop'}); assert.deepEqual(held.getState().fish,fish);
});

// Stage 9: all attacks and transactions go through the existing production dispatcher.
const weaponGame = (weaponId = 'fist', fish: unknown[] = [combatFish('golden',{x:0,y:1,z:1.5})], player: unknown = {position:{x:0,y:1,z:0}}) => {
  const game = new Game(); game.reset({seed:1,fixture:'shore',initial:{player,fish,unlockedWeapons:['fist','club','spear','hammer'],currentWeapon:weaponId}});
  game.dispatch({type:'setMode',mode:'combat'}); return game;
};
const weaponRows = [['fist',10,2,27,.1],['club',25,2,42,.5],['spear',40,3.2,48,.25],['hammer',65,2,66,1.2]] as const;

test('weapon reset validates IDs and equipped unlock atomically, returns detached arrays, and restart restores fist',()=>{
  const game=weaponGame('spear'); assert.deepEqual(game.getState().unlockedWeapons,['fist','club','spear','hammer']); assert.equal(game.getState().currentWeapon,'spear');
  const copy=game.getState(); copy.unlockedWeapons.length=0; copy.currentWeapon='hammer'; assert.equal(game.getState().currentWeapon,'spear'); assert.equal(game.getState().unlockedWeapons.length,4);
  for(const initial of [{unlockedWeapons:null},{unlockedWeapons:['club','club']},{unlockedWeapons:['gun']},{unlockedWeapons:'club'},
    {unlockedWeapons:['fist'],currentWeapon:'club'},{currentWeapon:'spear'},{currentWeapon:null},{unlockedWeapons:[1]},{unlockedWeapons:new Array(1)}]) {
    const before=game.getState(); assert.throws(()=>game.reset({seed:1,fixture:'shore',initial})); assert.deepEqual(game.getState(),before);
  }
  game.reset({seed:1,fixture:'shore',initial:{unlockedWeapons:['club'],currentWeapon:'club'}}); assert.deepEqual(game.getState().unlockedWeapons,['fist','club']);
  game.dispatch({type:'restart',confirm:true}); assert.deepEqual(game.getState().unlockedWeapons,['fist']); assert.equal(game.getState().currentWeapon,'fist');
});

test('sale to purchase is atomic once: 20 plus bass buys club leaving 10, insufficient or repeated purchase keeps balance',()=>{
  const game=tradeGame(); assert.equal(game.dispatch({type:'buy',weaponId:'club'}).accepted,false);
  game.dispatch({type:'openShop'}); sell(game); assert.equal(game.getState().coins,40);
  assert.equal(game.dispatch({type:'buy',weaponId:'club'}).accepted,true); assert.equal(game.getState().coins,10); assert.deepEqual(game.getState().unlockedWeapons,['fist','club']);
  assert.equal(game.getState().currentWeapon,'fist');
  assert.equal(game.dispatch({type:'buy',weaponId:'club'}).reason,'already-unlocked'); assert.equal(game.dispatch({type:'buy',weaponId:'spear'}).reason,'insufficient-coins');
  assert.equal(game.getState().coins,10); assert.equal(game.getState().events.filter(e=>e.type==='buy').length,1); assert.equal(game.getState().events.find(e=>e.type==='buy')!.entityId,'club');
  assert.equal(game.dispatch({type:'equip',weaponId:'club'}).accepted,true); game.dispatch({type:'closeShop'}); assert.equal(game.getState().currentWeapon,'club');
  game.dispatch({type:'pause'}); game.dispatch({type:'resume'}); game.dispatch({type:'setMode',mode:'combat'}); assert.equal(game.getState().currentWeapon,'club');
});

test('buy uses fixed prices and rejects malformed, injected and imprecise transactions without partial unlock',()=>{
  const game=tradeGame([],undefined,450); game.dispatch({type:'openShop'});
  for(const weaponId of ['club','spear','hammer']) assert.equal(game.dispatch({type:'buy',weaponId}).accepted,true);
  assert.equal(game.getState().coins,0); assert.equal(game.getState().unlockedWeapons.length,4); assert.equal(game.getState().events.filter(e=>e.type==='buy').length,3);
  for(const action of [{type:'buy'},{type:'buy',weaponId:'gun'},{type:'buy',weaponId:1},{type:'buy',weaponId:'fist'},
    {type:'buy',weaponId:'club',price:0},{type:'buy',weaponId:'club',coins:1000},{type:'buy',weaponId:'club',success:true}]) assert.equal(game.dispatch(action).accepted,false);
  assert.equal(game.getState().coins,0); assert.equal(game.getState().events.filter(e=>e.type==='buy').length,3);
  const huge=tradeGame([],undefined,Number.MAX_VALUE); huge.dispatch({type:'openShop'}); assert.equal(huge.dispatch({type:'buy',weaponId:'club'}).reason,'coin-limit');
  assert.equal(huge.getState().coins,Number.MAX_VALUE); assert.deepEqual(huge.getState().unlockedWeapons,['fist']);
});

test('all weapon damages, knockbacks and attack snapshots match the table through real targeting',()=>{
  for(const [id,damage,,ticks,knockback] of weaponRows) {
    const game=weaponGame(id); assert.equal(punch(game).accepted,true); const state=game.getState();
    assert.equal(state.fish[0].hp,150-damage); close(state.fish[0].position.z,1.5+knockback); close(state.attackCooldownRemaining,ticks/60);
    assert.equal(state.attack.weaponId,id); assert.equal(state.events.filter(e=>e.type==='fish_damage').length,1);
    game.dispatch({type:'equip',weaponId:id==='fist'?'club':'fist'}); assert.equal(game.getState().attack.weaponId,id); close(game.getState().attackCooldownRemaining,ticks/60);
  }
});

test('four weapon reach boundaries share collider, angle, nearest and true shop visibility checks',()=>{
  for(const [id,damage,range] of weaponRows) {
    const edge=Math.sqrt((range+.2)**2-.7**2);
    for(const [offset,hit] of [[-.001,true],[.001,false]] as const) {
      const game=weaponGame(id,[combatFish('golden',{x:0,y:1,z:edge+offset})]); punch(game); assert.equal(game.getState().fish[0].hp,hit?150-damage:150);
    }
    const blocked=weaponGame(id,[combatFish('golden',{x:-5,y:1,z:1.72})],{position:{x:-4.1,y:1,z:.9},yaw:Math.atan2(-.9,.82)}); punch(blocked); assert.equal(blocked.getState().fish[0].hp,150);
    const nearest=weaponGame(id,[combatFish('golden',{x:0,y:1,z:1.5},undefined,'groundedAlive','near'),combatFish('golden',{x:0,y:1,z:1.7},undefined,'groundedAlive','far'),combatFish('golden',{x:0,y:1,z:-1},undefined,'groundedAlive','behind')]);
    punch(nearest); assert.deepEqual(nearest.getState().fish.map(f=>f.hp),[150-damage,150,150]);
  }
});

test('attack cooldown locks at start across equips, misses, modes, menus and pause; hold never repeats',()=>{
  for(const [id,,,ticks] of weaponRows) {
    const game=weaponGame(id,[]); punch(game); const started=game.getState(); game.dispatch({type:'equip',weaponId:'fist'});
    game.dispatch({type:'setMode',mode:'fishing'}); game.dispatch({type:'setMode',mode:'combat'}); game.dispatch({type:'openInventory'});
    const frozen=game.getState(); game.advanceTicks(300); assert.deepEqual(game.getState(),frozen); game.dispatch({type:'closeInventory'});
    for(let i=0;i<ticks-1;i++) { game.advanceTicks(1); assert.equal(punch(game).reason,'attack-cooldown'); }
    close(game.getState().attackCooldownRemaining,1/60); assert.equal(game.getState().attack.weaponId,started.attack.weaponId);
    game.advanceTicks(1); assert.equal(punch(game).accepted,true); close(game.getState().attackCooldownRemaining,.45);
    game.advanceTicks(120); assert.equal(game.getState().attack.sequence,2);
  }
});

test('equip rejects locked weapons and injection, permits inventory without cancelling reel, and dead rejects purchases',()=>{
  const game=fresh(); assert.equal(game.dispatch({type:'equip',weaponId:'club'}).reason,'weapon-locked'); assert.equal(game.dispatch({type:'equip',weaponId:'fist'}).accepted,true);
  assert.equal(game.dispatch({type:'equip',weaponId:'fist',damage:100}).accepted,false); assert.equal(game.dispatch({type:'equip',weaponId:'gun'}).accepted,false);
  game.dispatch({type:'pause'}); assert.equal(game.dispatch({type:'equip',weaponId:'fist'}).accepted,false); game.dispatch({type:'openInventory'}); assert.equal(game.dispatch({type:'equip',weaponId:'fist'}).accepted,true);
  const reel=startReeling(); reel.dispatch({type:'openInventory'}); const before=reel.getState(); reel.dispatch({type:'equip',weaponId:'fist'}); assert.deepEqual(reel.getState().fishing,before.fishing); assert.equal(reel.getState().fishRngState,before.fishRngState);
  const dead=survivalGame(0,0); for(const type of ['buy','equip']) assert.equal(dead.dispatch({type,weaponId:'fist'}).reason,'dead');
});

test('hammer knockback stops at obstacles, alive sea crossing escapes once, lethal hit stays collectible with death priority',()=>{
  const blocked=weaponGame('hammer',[combatFish('golden',{x:-4.25,y:1,z:0})],{position:{x:-2.8,y:1,z:0},yaw:-Math.PI/2}); punch(blocked);
  assert.ok(blocked.getState().fish[0].position.x>=-4.300001); assert.equal(blocked.getState().fish[0].hp,85);
  for(const hp of [100,65]) {
    const game=weaponGame('hammer',[combatFish('golden',{x:0,y:1,z:9.4},hp)],{position:{x:0,y:1,z:8.5}}); punch(game); const state=game.getState();
    if(hp>65) { assert.equal(state.fish.length,0); assert.equal(state.terminalFish[0].state,'escaped'); game.advanceTicks(200); assert.equal(game.getState().events.filter(e=>e.type==='fish_escape').length,1); assert.equal(state.events.filter(e=>e.type==='fish_death').length,0); }
    else { assert.equal(state.fish[0].state,'groundedDead'); close(state.fish[0].position.z,9.8); assert.equal(state.terminalFish.length,0); assert.equal(game.dispatch({type:'interact'}).accepted,true); assert.equal(game.getState().inventory[0].id,'target'); }
    assert.equal(game.getState().coins,0);
  }
});

const bossGame = (initial: Record<string,unknown> = {}) => {
  const game=new Game();game.reset({seed:1,fixture:'boss-arena',initial});game.dispatch({type:'setMode',mode:'combat'});return game;
};
const initialBoss = (hp=600,tentacleRemaining=4,inkRemaining=3,state='active') => ({state,hp,tentacleRemaining,inkRemaining});
const bossHit = (game:Game) => { const result=punch(game);game.advanceTicks(1);return result; };
const rareReel = (fishRngState=stateBeforeDraw(0xffffffff)) => {
  const game=new Game();game.reset({seed:1,fixture:'shore',initial:{rareCaughtCount:2,fishRngState,player:{position:{x:0,y:1,z:9}}}});hook(game);return game;
};
const landExactly = (game:Game) => {
  for(let i=0;i<2000 && game.getState().fishing.phase==='reeling';i++) {
    const s=game.getState();if(s.fishing.tension>75) game.dispatch({type:'primaryUp'});else if(s.fishing.tension<40) game.dispatch({type:'primaryDown'});game.advanceTicks(1);
  }
  return game.getState();
};

test('boss fixture, legal associated initial states, timer bounds and rare counts validate atomically with detached snapshots',()=>{
  const game=bossGame();const s=game.getState();assert.deepEqual(s.player.position,{x:0,y:1,z:8.5});assert.equal(s.rareCaughtCount,3);
  assert.equal(s.boss.state,'active');assert.equal(s.boss.hp,600);assert.equal(s.boss.phase,1);assert.deepEqual(s.boss.position,{x:0,y:1,z:12});assert.equal(s.boss.radius,2);close(s.boss.tentacleRemaining,4);
  assert.equal(s.events.filter(e=>e.type==='boss_spawn').length,0);s.boss.position.z=99;s.boss.attacks.push({} as never);assert.equal(game.getState().boss.position.z,12);assert.equal(game.getState().boss.attacks.length,0);
  for(const initial of [{rareCaughtCount:-1},{rareCaughtCount:.5},{rareCaughtCount:NaN},{rareCaughtCount:null},{rareCaughtCount:Number.MAX_SAFE_INTEGER+1},
    {rareCaughtCount:2,boss:initialBoss()},{rareCaughtCount:3,boss:initialBoss(0,0,0,'locked')},{boss:initialBoss(0)},{boss:initialBoss(601)},{boss:initialBoss(600,-1)},
    {boss:initialBoss(300,4,3.1)},{boss:initialBoss(300,NaN)},{boss:initialBoss(10,4,3,'defeated')},{boss:{...initialBoss(),attacks:[]}}]) {
    const before=game.getState();assert.throws(()=>game.reset({seed:1,fixture:'boss-arena',initial}));assert.deepEqual(game.getState(),before);
  }
  const freshGame=fresh();assert.equal(freshGame.getState().rareCaughtCount,0);assert.equal(freshGame.getState().boss.state,'locked');
});

test('third real golden reel success keeps carried fish, increments once and spawns boss once; broken line and non-golden do not',()=>{
  const game=rareReel();assert.equal(game.getState().fishing.species,'golden');const landed=landExactly(game);
  assert.equal(landed.rareCaughtCount,3);assert.equal(landed.fish[0].state,'carried');assert.equal(landed.fish[0].species,'golden');assert.equal(landed.boss.state,'active');assert.equal(landed.boss.hp,600);close(landed.boss.tentacleRemaining,4);
  assert.equal(landed.events.filter(e=>e.type==='landing').length,1);assert.equal(landed.events.filter(e=>e.type==='boss_spawn').length,1);game.advanceTicks(60);assert.equal(game.getState().rareCaughtCount,3);
  const failed=rareReel();failed.advanceTicks(180);assert.equal(failed.getState().fishing.result,'line-broken');assert.equal(failed.getState().rareCaughtCount,2);assert.equal(failed.getState().boss.state,'locked');assert.equal(failed.getState().fish.length,0);
  const normal=rareReel(1);landExactly(normal);assert.equal(normal.getState().rareCaughtCount,2);assert.equal(normal.getState().boss.state,'locked');
});

test('rare capture count ignores later fish states and subsequent golden capture never duplicates the boss',()=>{
  let rng=1;while(!(referenceFishDraw(rng).species==='golden' && referenceFishDraw(referenceFishDraw(rng).state).species==='golden')) rng++;
  const game=rareReel(rng);landExactly(game);game.dispatch({type:'look',yaw:Math.PI,pitch:0});assert.equal(game.dispatch({type:'interact'}).accepted,true);game.advanceTicks(140);
  assert.equal(game.getState().fish.length,0);assert.equal(game.getState().terminalFish[0].state,'escaped');assert.equal(game.getState().rareCaughtCount,3);
  game.dispatch({type:'look',yaw:0,pitch:0});hook(game);landExactly(game);assert.equal(game.getState().rareCaughtCount,4);assert.equal(game.getState().fish[0].state,'carried');assert.equal(game.getState().events.filter(e=>e.type==='boss_spawn').length,1);
  const transfer=new Game();transfer.reset({seed:1,fixture:'shore',initial:{rareCaughtCount:2,player:{position:{x:-6,y:1,z:-2},hunger:50},inventory:[storedFish('eat-gold','golden'),storedFish('sell-gold','golden')]}});
  eat(transfer,'eat-gold');transfer.dispatch({type:'openShop'});sell(transfer,'sell-gold');assert.equal(transfer.getState().rareCaughtCount,2);assert.equal(transfer.getState().boss.state,'locked');
});

test('boss body sphere receives all four weapon damages without knockback, locks cooldown and picks nearest visible target',()=>{
  for(const [id,damage,,cooldown] of weaponRows) {
    const game=bossGame({unlockedWeapons:['fist','club','spear','hammer'],currentWeapon:id});const p=game.getState().boss.position;
    assert.equal(bossHit(game).accepted,true);assert.equal(game.getState().boss.hp,600-damage);assert.deepEqual(game.getState().boss.position,p);close(game.getState().attackCooldownRemaining,(cooldown-1)/60);
    assert.equal(game.getState().attack.targetKind,'boss');assert.equal(game.getState().events.filter(e=>e.type==='boss_damage').length,1);
    assert.equal(punch(game).accepted,false);game.dispatch({type:'equip',weaponId:'fist'});assert.equal(punch(game).accepted,false);
  }
  const nearest=bossGame({fish:[combatFish('sprat',{x:0,y:1,z:9.4})]});bossHit(nearest);assert.equal(nearest.getState().fish[0].hp,10);assert.equal(nearest.getState().boss.hp,600);
  const far=bossGame({player:{position:{x:0,y:1,z:7.6}}});bossHit(far);assert.equal(far.getState().boss.hp,600);
  const spear=bossGame({player:{position:{x:0,y:1,z:7.6}},unlockedWeapons:['spear'],currentWeapon:'spear'});bossHit(spear);assert.equal(spear.getState().boss.hp,560);
  const back=bossGame({player:{yaw:Math.PI}});bossHit(back);assert.equal(back.getState().boss.hp,600);
});

test('tentacle locks the tick-240 position, warns exactly 72 ticks, hits once for 15 and lasts 18 active ticks',()=>{
  const game=bossGame();game.advanceTicks(239);assert.equal(game.getState().boss.attacks.length,0);close(game.getState().boss.tentacleRemaining,1/60);
  game.advanceTicks(1);let attack=game.getState().boss.attacks[0];assert.equal(attack.type,'tentacle');assert.equal(attack.phase,'warning');assert.deepEqual(attack.position,{x:0,y:1,z:8.5});close(attack.remaining,1.2);
  game.advanceTicks(71);close(game.getState().player.hp,100);game.advanceTicks(1);attack=game.getState().boss.attacks[0];assert.equal(attack.phase,'active');close(attack.remaining,.3);close(game.getState().player.hp,85);
  game.advanceTicks(17);assert.equal(game.getState().boss.attacks.length,1);close(game.getState().player.hp,85);game.advanceTicks(1);assert.equal(game.getState().boss.attacks.length,0);close(game.getState().player.hp,85);
  game.advanceTicks(150);assert.equal(game.getState().boss.attacks[0].phase,'warning');close(game.getState().boss.tentacleRemaining,4);
});

test('locked tentacle warning does not follow movement; leaving radius avoids damage and entering active zone hits once',()=>{
  const game=bossGame();game.advanceTicks(240);move(game,0,1);game.advanceTicks(31);move(game,0);const locked=game.getState().boss.attacks[0].position;assert.equal(locked.x,0);
  game.advanceTicks(41);close(game.getState().player.hp,100);move(game,0,-1);game.advanceTicks(2);move(game,0);close(game.getState().player.hp,85);
  game.advanceTicks(16);close(game.getState().player.hp,85);assert.equal(game.getState().boss.attacks.length,0);
  const contact=bossGame();contact.advanceTicks(120);close(contact.getState().player.hp,100);
});

test('real hits reaching HP300 switch phase and start a full three-second ink timer without resetting tentacles',()=>{
  const game=bossGame();for(let i=0;i<30;i++){bossHit(game);if(i<29) game.advanceTicks(26);}
  assert.equal(game.getState().boss.hp,300);assert.equal(game.getState().boss.phase,2);close(game.getState().boss.inkRemaining,3);
  const tentacle=game.getState().boss.tentacleRemaining;game.dispatch({type:'openInventory'});const frozen=game.getState();game.advanceTicks(600);assert.deepEqual(game.getState(),frozen);game.dispatch({type:'closeInventory'});
  game.advanceTicks(179);assert.equal(game.getState().boss.attacks.some(a=>a.type==='ink'),false);game.advanceTicks(1);const ink=game.getState().boss.attacks.find(a=>a.type==='ink')!;assert.equal(ink.phase,'warning');close(ink.remaining,.8);
  assert.ok(game.getState().boss.tentacleRemaining!==tentacle);assert.ok(game.getState().player.hp>0);
});

test('ink warns 48 ticks, locks its original direction, travels six metres a second and misses a moving player',()=>{
  const game=bossGame({boss:initialBoss(300)});game.advanceTicks(180);const ink=game.getState().boss.attacks.find(a=>a.type==='ink')!;assert.equal(ink.phase,'warning');close(ink.remaining,.8);
  assert.deepEqual(ink.direction,{x:0,y:0,z:-1});move(game,0,1);game.advanceTicks(47);move(game,0);assert.equal(game.getState().boss.attacks.find(a=>a.id===ink.id)!.phase,'warning');
  game.advanceTicks(1);const fired=game.getState().boss.attacks.find(a=>a.id===ink.id)!;assert.equal(fired.phase,'flying');close(fired.remaining,5);close(fired.position.z,12);
  game.advanceTicks(60);const moved=game.getState().boss.attacks.find(a=>a.id===ink.id)!;close(moved.position.z,6);close(moved.remaining,4);assert.deepEqual(moved.direction,ink.direction);close(game.getState().player.hp,100);
  game.advanceTicks(240);assert.equal(game.getState().boss.attacks.some(a=>a.id===ink.id),false);
});

test('ink swept body hit deals ten once and destroys projectile; pausing warning and flight freezes every timer',()=>{
  const game=bossGame({boss:initialBoss(300)});game.advanceTicks(180);game.dispatch({type:'pause'});let frozen=game.getState();game.advanceTicks(600);assert.deepEqual(game.getState(),frozen);game.dispatch({type:'resume'});
  game.advanceTicks(48);const inkId=game.getState().boss.attacks.find(a=>a.type==='ink')!.id;game.advanceTicks(5);game.dispatch({type:'pause'});frozen=game.getState();game.advanceTicks(300);assert.deepEqual(game.getState(),frozen);game.dispatch({type:'resume'});
  game.advanceTicks(26);close(game.getState().player.hp,90);assert.equal(game.getState().boss.attacks.some(a=>a.id===inkId),false);game.advanceTicks(12);close(game.getState().player.hp,90);
});

test('boss damage and starvation share a health baseline so hunger cannot heal away tentacle damage',()=>{
  const game=bossGame({player:{hunger:19.5}});game.advanceTicks(312);close(game.getState().player.hp,100-312/30-15);game.advanceTicks(1);close(game.getState().player.hp,100-313/30-15);
  const eaten=bossGame({player:{hunger:19.5},inventory:[storedFish('food','golden')]});eaten.advanceTicks(312);const hp=eaten.getState().player.hp;eat(eaten);eaten.advanceTicks(60);close(eaten.getState().player.hp,hp);
});

test('victory, boss death and simultaneous lethal damage resolve at the fixed tick with player death priority and freeze',()=>{
  for(const [playerHp,bossHp,expected] of [[100,10,'victory'],[15,600,'dead'],[15,10,'dead']] as const) {
    const game=bossGame({player:{hp:playerHp},boss:initialBoss(bossHp,1/60)});game.advanceTicks(72);
    if(bossHp===10) punch(game);game.advanceTicks(1);const final=game.getState();assert.equal(final.gamePhase,expected);assert.equal(final.player.hp,playerHp===15?0:85);
    assert.equal(final.boss.state,bossHp===10?'defeated':'active');assert.equal(final.events.filter(e=>e.type==='victory').length,expected==='victory'?1:0);game.advanceTicks(600);assert.deepEqual(game.getState(),final);
    for(const action of [{type:'resume'},{type:'move',forward:1,strafe:0,sprint:true},{type:'primaryDown'},{type:'openInventory'},{type:'buy',weaponId:'club'},{type:'equip',weaponId:'fist'}]) assert.equal(game.dispatch(action).accepted,false);
    game.dispatch({type:'restart',confirm:true});assert.equal(game.getState().rareCaughtCount,0);assert.equal(game.getState().boss.state,'locked');assert.equal(game.getState().gamePhase,'running');assert.equal(game.getState().stats.caught,0);
  }
  const direct=bossGame({boss:initialBoss(0,0,0,'defeated')});assert.equal(direct.getState().gamePhase,'victory');
  const both=bossGame({player:{hp:0},boss:initialBoss(0,0,0,'defeated')});assert.equal(both.getState().gamePhase,'dead');
});

test('boss hit cannot be injected, shared cooldown survives pause, and victory stats only count real damage',()=>{
  const game=bossGame({boss:initialBoss(65),unlockedWeapons:['hammer'],currentWeapon:'hammer'});const before=game.getState();
  for(const action of [{type:'primaryDown',damage:600},{type:'primaryDown',targetId:'octopus'},{type:'boss_damage'},{type:'victory'}]) assert.equal(game.dispatch(action).accepted,false);
  assert.equal(game.getState().boss.hp,before.boss.hp);punch(game);game.dispatch({type:'pause'});const frozen=game.getState();game.advanceTicks(300);assert.deepEqual(game.getState(),frozen);game.dispatch({type:'resume'});game.advanceTicks(1);
  assert.equal(game.getState().gamePhase,'victory');assert.equal(game.getState().stats.bossDamageDealt,65);assert.equal(game.getState().events.filter(e=>e.type==='boss_damage').length,1);
});

test('ink uses locked vertical aim against the actual player body and swept shop obstruction prevents through-wall damage',()=>{
  const high=bossGame({player:{position:{x:0,y:5,z:8.5}},boss:initialBoss(300,4,0)});high.advanceTicks(1);const shot=high.getState().boss.attacks.find(a=>a.type==='ink')!;assert.ok(shot.direction.y>0);
  high.advanceTicks(108);assert.equal(high.getState().player.position.y,1);assert.equal(high.getState().boss.attacks.some(a=>a.id===shot.id),true);close(high.getState().player.hp,100);
  const wall=bossGame({player:{position:{x:-8,y:1,z:0}},boss:initialBoss(300,4,0)});wall.advanceTicks(1);const id=wall.getState().boss.attacks.find(a=>a.type==='ink')!.id;wall.advanceTicks(198);
  assert.equal(wall.getState().boss.attacks.some(a=>a.id===id),false);close(wall.getState().player.hp,100);
});

test('save snapshot restores complete mixed entities, RNG, weapons and active boss without mutable references', () => {
  const game=fresh();game.reset({seed:13320,fixture:'boss-arena',initial:{coins:47,unlockedWeapons:['club','spear'],currentWeapon:'spear',player:{hp:81,hunger:72},inventory:[{id:'bag',species:'tuna'}],fish:[{id:'hand',species:'golden',state:'carried',position:{x:0,y:1,z:0},jumpTimer:0},{id:'live',species:'bass',state:'groundedAlive',position:{x:3,y:1,z:3},jumpTimer:.5},{id:'corpse',species:'sprat',state:'groundedDead',position:{x:4,y:1,z:4},jumpTimer:0,hp:0}]}});
  game.advanceTicks(17);const before=game.getState();const value=game.exportSave();const restored=fresh();restored.importSave(value);const after=restored.getState();
  for(const key of ['simulationTick','fishRngState','player','coins','unlockedWeapons','currentWeapon','fish','inventory','rareCaughtCount','boss','stats'] as const) assert.deepEqual(after[key],before[key]);
  assert.equal(after.gamePhase,'paused');assert.equal(after.ui.menu,'pause');restored.advanceTicks(300);assert.deepEqual(restored.getState(),after);
  value.state.player.hp=1;value.state.fish[0].hp=1;assert.equal(restored.getState().player.hp,81);assert.equal(game.getState().fish[0].hp,150);
});
test('save preserves exact jumping, warning, flight and survival clocks instead of replaying elapsed offline time',()=>{
  const game=fresh();game.reset({seed:1,fixture:'boss-arena',initial:{player:{hunger:19,hp:90},boss:{state:'active',hp:300,tentacleRemaining:1,inkRemaining:0},fish:[{id:'jump',species:'tuna',state:'groundedAlive',position:{x:5,y:1,z:2},jumpTimer:1.1}]}});
  move(game,0,1);game.advanceTicks(60);move(game,0,0);assert.equal(game.getState().boss.attacks.some(a=>a.type==='ink'&&a.phase==='flying'),true);
  // Save mid next jump and an active tentacle warning.
  game.advanceTicks(17);const saved=game.exportSave();const recovered=fresh();recovered.importSave(JSON.parse(JSON.stringify(saved)));recovered.dispatch({type:'resume'});
  game.advanceTicks(30);recovered.advanceTicks(30);const a=game.getState(),b=recovered.getState();for(const key of ['player','fish','boss','fishRngState','simulationTick'] as const)assert.deepEqual(b[key],a[key]);
});
test('save rejects every active fishing phase and attack animation but permits completed animation with remaining cooldown',()=>{
  const game=fresh();game.reset({seed:1,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9}}}});game.dispatch({type:'primaryDown'});assert.throws(()=>game.exportSave());game.dispatch({type:'primaryUp'});assert.throws(()=>game.exportSave());game.advanceTicks(120);assert.throws(()=>game.exportSave());game.dispatch({type:'primaryDown'});assert.throws(()=>game.exportSave());game.dispatch({type:'cancelFishing'});
  game.dispatch({type:'setMode',mode:'combat'});game.dispatch({type:'primaryDown'});assert.throws(()=>game.exportSave());game.advanceTicks(27);assert.doesNotThrow(()=>game.exportSave());
  game.reset({seed:1,fixture:'boss-arena',initial:{unlockedWeapons:['hammer'],currentWeapon:'hammer'}});game.dispatch({type:'setMode',mode:'combat'});game.dispatch({type:'primaryDown'});game.advanceTicks(51);const value=game.exportSave();assert.equal(value.state.attackCooldownRemaining,.25);const recovered=fresh();recovered.importSave(value);recovered.dispatch({type:'resume'});assert.equal(recovered.dispatch({type:'primaryDown'}).accepted,false);recovered.advanceTicks(15);assert.equal(recovered.dispatch({type:'primaryDown'}).accepted,true);
});
test('invalid or truncated save rejects atomically including duplicate IDs, negative coins and associated boss states',()=>{
  const game=fresh();const valid=game.exportSave();const before=game.getState();const mutations=[(v:any)=>v.version=9,(v:any)=>delete v.runtime,(v:any)=>v.state.coins=-1,(v:any)=>v.state.player.hp=NaN,(v:any)=>v.state.currentWeapon='hammer',(v:any)=>v.state.boss.state='active',(v:any)=>v.state.inventory=[{id:'duplicate',species:'sprat',state:'inventoryDead'},{id:'duplicate',species:'bass',state:'inventoryDead'}],(v:any)=>v.runtime.survival.hungerTicks=-1,(v:any)=>v.state.gamePhase='victory'];
  for(const mutate of mutations){const v=structuredClone(valid);mutate(v);assert.throws(()=>game.importSave(v));assert.deepEqual(game.getState(),before);}assert.throws(()=>game.importSave(null));assert.throws(()=>game.importSave({version:1}));
});
test('menu saves the underlying world and consumption remains exclusive across repeated loads; restart leaves exported snapshot intact',()=>{
  const game=fresh();game.reset({seed:1,fixture:'shore',initial:{player:{position:{x:-6,y:1,z:-2},hunger:80},coins:10,inventory:[{id:'sale',species:'bass'},{id:'food',species:'sprat'}]}});game.dispatch({type:'eat',fishId:'food'});game.dispatch({type:'openShop'});const value=game.exportSave();assert.equal(value.state.gamePhase,'running');game.dispatch({type:'restart',confirm:true});game.importSave(value);assert.equal(game.getState().ui.menu,'pause');assert.equal(game.getState().consumedFish.length,1);game.dispatch({type:'resume'});game.dispatch({type:'openShop'});game.dispatch({type:'sell',fishId:'sale'});assert.equal(game.getState().coins,30);assert.equal(game.dispatch({type:'sell',fishId:'sale'}).accepted,false);const sold=game.exportSave();game.importSave(sold);game.dispatch({type:'resume'});game.dispatch({type:'openShop'});assert.equal(game.dispatch({type:'sell',fishId:'sale'}).accepted,false);assert.equal(game.getState().coins,30);
});
test('terminal saves remain dead or victory on restore without publishing terminal rewards again',()=>{
  for(const hp of [0,100]){const game=fresh();game.reset({seed:1,fixture:'boss-arena',initial:{player:{hp},boss:{state:'defeated',hp:0,tentacleRemaining:4,inkRemaining:3}}});const value=game.exportSave();const phase=game.getState().gamePhase;game.importSave(value);assert.equal(game.getState().gamePhase,phase);assert.equal(game.getState().events.length,0);game.advanceTicks(600);assert.equal(game.getState().simulationTick,0);assert.equal(game.dispatch({type:'resume'}).accepted,false);}
});

test('corrupt moving entities, boss projectiles and internal clocks cannot partially restore a save',()=>{
  const game=fresh();game.reset({seed:1,fixture:'boss-arena',initial:{boss:{state:'active',hp:300,tentacleRemaining:.05,inkRemaining:0},fish:[{id:'moving',species:'tuna',state:'groundedAlive',position:{x:5,y:1,z:2},jumpTimer:1.1}],inventory:[{id:'bag',species:'sprat'}]}});game.advanceTicks(65);const valid=game.exportSave();const before=game.getState();
  const cases:((value:typeof valid)=>void)[]=[
    v=>{v.state.player.position={x:-6,y:1,z:0};},v=>{v.state.fish[0].position.y=2;},v=>{v.state.fish[0].hp=-1;},v=>{v.state.fish[0].jumpTimer=5;},v=>{v.state.fish[0].jumpDirection={x:2,z:0};},v=>{v.state.inventory[0].id='moving';},
    v=>{v.state.boss.attacks=[];},v=>{v.runtime.boss.attackTicks=[];},v=>{v.state.boss.attacks[0].remaining=0;},v=>{v.state.boss.position.z=10;},v=>{v.state.boss.radius=4;},v=>{v.state.boss.phase=1;},v=>{v.state.boss.attacks[0].id='tentacle-999999';},
    v=>{const ink=v.state.boss.attacks.find(a=>a.type==='ink')!;if(ink.type==='ink')ink.direction.z=2;},v=>{v.runtime.boss.nextAttack=1;},v=>{v.runtime.survival.hpBase=1;},v=>{v.runtime.survival.hungerTicks=10000;},v=>{v.runtime.attackCooldownTicks=67;},v=>{v.state.attackCooldownRemaining=.5;},v=>{v.runtime.reservedFishIds.push('moving');},v=>{v.runtime.initialFishRngState=0;},v=>{v.runtime.nextFishId=0;},v=>{v.state.simulationTick=-1;},v=>{Object.assign(v.state,{mode:'invalid'});},v=>{Reflect.deleteProperty(v.state,'stats');},v=>{Object.assign(v.state.player,{extra:1});},v=>{v.state.unlockedWeapons.length=2;Object.assign(v.state.unlockedWeapons,{extra:'spear'});},
  ];for(const corrupt of cases){const value=structuredClone(valid);corrupt(value);assert.throws(()=>game.importSave(value));assert.deepEqual(game.getState(),before);}
});

test('save and restore preserve actual sold and consumed deduplication and initial fish RNG on confirmed restart',()=>{
  const game=fresh();game.reset({seed:7,fixture:'shore',initial:{fishRngState:1584200935,player:{position:{x:-6,y:1,z:-2},hunger:60},inventory:[{id:'food',species:'bass'},{id:'trade',species:'golden'}]}});game.dispatch({type:'eat',fishId:'food'});game.dispatch({type:'openShop'});game.dispatch({type:'sell',fishId:'trade'});const value=game.exportSave();game.importSave(value);assert.equal(game.getState().coins,120);assert.equal(game.getState().consumedFish[0].id,'food');assert.equal(game.getState().terminalFish[0].id,'trade');game.dispatch({type:'resume'});game.dispatch({type:'openShop'});assert.equal(game.dispatch({type:'sell',fishId:'trade'}).accepted,false);assert.equal(game.dispatch({type:'eat',fishId:'food'}).accepted,false);assert.equal(game.getState().coins,120);game.dispatch({type:'restart',confirm:true});assert.equal(game.getState().fishRngState,1584200935);
  const corrupted=structuredClone(value);corrupted.state.terminalFish[0].id='food';const before=game.getState();assert.throws(()=>game.importSave(corrupted));assert.deepEqual(game.getState(),before);
});

test('a real lethal boss attack finishes its visual action at terminal commit and saves victory without duplicate events',()=>{
  const game=fresh();game.reset({seed:1,fixture:'boss-arena',initial:{boss:{state:'active',hp:10,tentacleRemaining:4,inkRemaining:3}}});game.dispatch({type:'setMode',mode:'combat'});game.dispatch({type:'primaryDown'});game.step();assert.equal(game.getState().gamePhase,'victory');const value=game.exportSave();assert.equal(value.state.stats.bossDamageDealt,10);const tick=value.state.simulationTick;game.importSave(value);assert.equal(game.getState().gamePhase,'victory');assert.equal(game.getState().events.length,0);assert.equal(game.getState().simulationTick,tick);
});

import { Persistence } from '../src/game/persistence.ts';
import { SaveStore } from '../src/game/save-store.ts';
import type { SaveFile } from '../src/game/save-format.ts';

test('production persistence queues a save before load, captures one tick, and rejects an invalid read before committing',async()=>{
  let release!:()=>void;let started!:()=>void;const writing=new Promise<void>(resolve=>{started=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
  class DelayedStore extends SaveStore {
    value:unknown;
    override async write(value:SaveFile):Promise<void>{started();await gate;this.value=structuredClone(value);}
    override async read():Promise<unknown>{return structuredClone(this.value);}
  }
  const game=fresh();const store=new DelayedStore();const notices:string[]=[];let loading=0;let committed=0;
  const persistence=new Persistence(game,{status:s=>{notices.push(s);},beginLoad:()=>{loading++;},endLoad:()=>{loading--;},restored:()=>{committed++;}},store);
  const save=persistence.save();await writing;game.advanceTicks(12);const load=persistence.load();assert.equal(loading,0);release();assert.equal((await save).ok,true);assert.equal((await load).ok,true);await persistence.waitUntilIdle();assert.equal(game.getState().simulationTick,0);assert.equal(game.getState().gamePhase,'paused');assert.equal(committed,1);assert.equal(loading,0);assert.match(notices.at(-1)! ,/已读取/);
  const before=game.getState();store.value={version:99};assert.equal((await persistence.load()).ok,false);assert.deepEqual(game.getState().player,before.player);assert.equal(game.getState().simulationTick,before.simulationTick);assert.equal(committed,1);assert.equal(loading,0);assert.equal((await persistence.importSave({version:99})).ok,false);
});

test('unavailable real storage reports save/load failures and still permits detached export without unhandled errors',async()=>{
  const game=fresh();const messages:string[]=[];let loading=0;
  const persistence=new Persistence(game,{status:s=>{messages.push(s);},beginLoad:()=>{loading++;},endLoad:()=>{loading--;},restored:()=>assert.fail('unavailable storage cannot restore')});
  assert.equal((await persistence.save()).ok,false);assert.equal(game.getState().lastAction.accepted,false);assert.equal((await persistence.load()).ok,false);assert.equal(loading,0);assert.match(messages.at(-1)!,/读取失败/);const exported=await persistence.exportSave();exported.state.player.hp=4;assert.equal(game.getState().player.hp,100);
});

test('clock suspension for a pending load never advances or catches up and release starts a fresh wall time baseline',()=>{
  const oldRequest=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;let callback:FrameRequestCallback|undefined;
  globalThis.requestAnimationFrame=next=>{callback=next;return 1;};globalThis.cancelAnimationFrame=()=>{};
  try {const game=fresh();const clock=new GameClock(game,()=>{});const frame=(time:number)=>callback!(time);clock.start();frame(0);frame(17);const tick=game.getState().simulationTick;clock.suspend();frame(5000);frame(10000);assert.equal(game.getState().simulationTick,tick);assert.equal(game.getState().gamePhase,'running');clock.release();frame(20000);assert.equal(game.getState().simulationTick,tick);frame(20017);assert.equal(game.getState().simulationTick,tick+1);clock.dispose();}finally{globalThis.requestAnimationFrame=oldRequest;globalThis.cancelAnimationFrame=oldCancel;}
});

import { defaultSettings, updateSettings, bindingAction } from '../src/game/settings.ts';

test('settings defaults and partial updates reject conflicts, reserved keys and invalid ranges atomically',()=>{
  const initial=defaultSettings();const next=updateSettings(initial,{volume:0,sensitivity:2,bindings:{interact:'KeyF'}});assert.equal(next.volume,0);assert.equal(bindingAction(next,'KeyF'),'interact');assert.equal(bindingAction(next,'KeyE'),undefined);assert.equal(initial.volume,100);
  for(const value of [{volume:-1},{volume:101},{volume:NaN},{sensitivity:0},{sensitivity:Infinity},{sensitivity:3.1},{bindings:{interact:'KeyW'}},{bindings:{interact:'Escape'}},{bindings:{interact:'F5'}},{bindings:{unknown:'KeyF'}},{bindings:{interact:'Numpad1'}},{volume:0,bindings:{interact:'KeyW'}}])assert.throws(()=>updateSettings(initial,value));assert.deepEqual(initial,defaultSettings());
});
test('settings menu freezes the real world, closes to pause, and persists across game reset, save import and restart',()=>{
  const game=fresh();move(game);game.advanceTicks(20);assert.equal(game.dispatch({type:'openSettings'}).accepted,true);const frozen=game.getState();assert.equal(frozen.ui.menu,'settings');game.advanceTicks(600);assert.deepEqual(game.getState(),frozen);assert.equal(game.dispatch({type:'resume'}).accepted,false);
  assert.equal(game.dispatch({type:'updateSettings',volume:0,sensitivity:1.5,bindings:{interact:'KeyF'}}).accepted,true);const settings=game.getState().settings;const changed=game.getState();assert.equal(game.dispatch({type:'updateSettings',volume:25,bindings:{jump:'KeyF'}}).accepted,false);assert.deepEqual(game.getState().settings,settings);assert.equal(game.getState().player.position.z,changed.player.position.z);
  game.dispatch({type:'closeSettings'});assert.equal(game.getState().gamePhase,'paused');const save=game.exportSave();assert.equal(Object.hasOwn(save.state,'settings'),false);game.reset({seed:9,fixture:'shore'});assert.deepEqual(game.getState().settings,settings);game.importSave(save);assert.deepEqual(game.getState().settings,settings);game.dispatch({type:'restart',confirm:true});assert.deepEqual(game.getState().settings,settings);
});

import { validateReplay, replay } from '../src/game/replay.ts';

test('production replay is identical at 30/60/120Hz schedules and single or batched fixed steps, including RNG and menus',async()=>{
  const inputs=[{tick:0,action:{type:'primaryDown'}},{tick:30,action:{type:'primaryUp'}},{tick:150,action:{type:'primaryDown'}},{tick:200,action:{type:'primaryUp'}},{tick:240,action:{type:'pause'}},{tick:270,action:{type:'resume'}},{tick:300,action:{type:'primaryDown'}},{tick:350,action:{type:'primaryUp'}},{tick:400,action:{type:'cancelFishing'}},{tick:401,action:{type:'setMode',mode:'combat'}},{tick:402,action:{type:'move',forward:0,strafe:1,sprint:true}},{tick:430,action:{type:'jump'}},{tick:460,action:{type:'move',forward:0,strafe:0,sprint:false}},{tick:490,action:{type:'openInventory'}},{tick:530,action:{type:'closeInventory'}}];
  const base={seed:13320,fixture:'shore',initial:{player:{position:{x:0,y:1,z:9}}},inputs,totalTicks:600};let expected:ReturnType<Game['getState']>|undefined;
  for(const renderHz of [30,60,120] as const){const options=validateReplay({...base,renderHz});const game=fresh();game.reset({seed:options.seed,fixture:options.fixture,initial:options.initial});let frames=0;const result=await replay(game,options,action=>game.dispatch(action),()=>{frames++;});assert.equal(frames,renderHz*10);if(expected)assert.deepEqual(result,expected);else expected=result;}
  for(const batch of [1,7,60]){const game=fresh();game.reset({seed:base.seed,fixture:base.fixture,initial:base.initial});let at=0;for(const input of [...inputs,{tick:600,action:null}]){let left=input.tick-at;while(left>0){const count=Math.min(batch,left);game.advanceTicks(count);left-=count;}if(input.action)game.dispatch(input.action);at=input.tick;}assert.deepEqual(game.getState(),expected);}
});
test('replay rejects malformed envelope or initial world before mutating the current game',()=>{
  const game=fresh();const before=game.getState();const valid={seed:1,fixture:'shore',inputs:[],totalTicks:10,renderHz:60};
  for(const value of [null,{...valid,renderHz:144},{...valid,totalTicks:-1},{...valid,totalTicks:36001},{...valid,seed:-1},{...valid,initial:{player:{hp:101}}},{...valid,inputs:[{tick:10,action:{type:'jump'}}]},{...valid,inputs:[{tick:0,action:{type:'unknown-action'}}]},{...valid,inputs:[{tick:0,action:null}]}]){assert.throws(()=>validateReplay(value));assert.deepEqual(game.getState(),before);}
});

test('settings disk writer failure preserves all old values, and a later valid write commits once',()=>{
  const game=fresh();let fail=true;let writes=0;game.installSettings(defaultSettings(),()=>{writes++;if(fail)throw new Error('Quota');});game.dispatch({type:'openSettings'});const old=game.getState().settings;
  assert.equal(game.dispatch({type:'updateSettings',volume:0,sensitivity:2,bindings:{interact:'KeyF'}}).reason,'settings-write-failed');assert.deepEqual(game.getState().settings,old);fail=false;
  assert.equal(game.dispatch({type:'updateSettings',volume:0,sensitivity:2,bindings:{interact:'KeyF'}}).accepted,true);assert.equal(writes,2);assert.equal(game.getState().settings.volume,0);
  assert.equal(game.dispatch({type:'updateSettings',bindings:{interact:'Escape'}}).accepted,false);assert.equal(writes,2);
});

test('actual GameClock frame schedules at 30/60/120Hz produce identical fixed ticks and movement',()=>{
  const oldRequest=globalThis.requestAnimationFrame,oldCancel=globalThis.cancelAnimationFrame;let callback:FrameRequestCallback|undefined;globalThis.requestAnimationFrame=next=>{callback=next;return 1;};globalThis.cancelAnimationFrame=()=>{};
  try{let expected:ReturnType<Game['getState']>|undefined;for(const hz of [30,60,120]){const game=fresh();move(game);const clock=new GameClock(game,()=>{});clock.start();callback!(0);for(let frame=1;frame<=hz;frame++)callback!(frame*1000/hz);assert.equal(game.getState().simulationTick,60);if(expected)assert.deepEqual(game.getState(),expected);else expected=game.getState();clock.dispose();}}
  finally{globalThis.requestAnimationFrame=oldRequest;globalThis.cancelAnimationFrame=oldCancel;}
});

test('fresh replay session restores allocation baseline while ordinary reset never reuses earlier catch IDs',async()=>{
  const base={seed:1,fixture:'shore' as const,initial:{player:{position:{x:0,y:1,z:9}}}};const planner=fresh();planner.reset(base);const inputs:{tick:number;action:unknown}[]=[];let at=0;const action=(value:unknown)=>{inputs.push({tick:at,action:value});planner.dispatch(value);};const advance=(n:number)=>{planner.advanceTicks(n);at+=n;};action({type:'primaryDown'});advance(30);action({type:'primaryUp'});advance(120);action({type:'primaryDown'});
  while(planner.getState().fishing.phase==='reeling'&&at<3000){const s=planner.getState().fishing;if(s.tension>75&&s.holding)action({type:'primaryUp'});else if(s.tension<40&&!s.holding)action({type:'primaryDown'});advance(1);}assert.equal(planner.getState().stats.caught,1);
  const game=fresh();let expected:ReturnType<Game['getState']>|undefined;for(const renderHz of [30,60,120] as const){game.reset(base,true);const options=validateReplay({...base,inputs,totalTicks:at+1,renderHz});const result=await replay(game,options);assert.equal(result.fish[0].id,'fish-1-1');if(expected)assert.deepEqual(result,expected);else expected=result;}
  game.reset(base);const result=await replay(game,validateReplay({...base,inputs,totalTicks:at+1,renderHz:60}));assert.equal(result.fish[0].id,'fish-1-2');
});

test('settings do not allow gameplay consumption, including when opened from a terminal world',()=>{
  for(const hp of [0,100]){const game=fresh();game.reset({seed:1,fixture:'shore',initial:{player:{hp,hunger:60},inventory:[{id:'food',species:'sprat'}]}});game.dispatch({type:'openSettings'});const before=game.getState();assert.equal(game.dispatch({type:'eat',fishId:'food'}).accepted,false);assert.deepEqual(game.getState().inventory,before.inventory);assert.equal(game.getState().player.hunger,before.player.hunger);game.dispatch({type:'closeSettings'});assert.equal(game.getState().gamePhase,hp===0?'dead':'paused');}
});

test('volume accepts finite fractional percentages across the documented zero-to-hundred range',()=>{
  const next=updateSettings(defaultSettings(),{volume:50.5});assert.equal(next.volume,50.5);for(const volume of [NaN,Infinity,-.1,100.1])assert.throws(()=>updateSettings(defaultSettings(),{volume}));
});
