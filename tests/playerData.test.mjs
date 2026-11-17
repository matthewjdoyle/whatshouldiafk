import assert from 'node:assert/strict';
import test from 'node:test';
import methods from '../src/data/methods.json' with { type: 'json' };
import { meetsSkillRequirements, normalizeRsn, isValidRsn, readPlayerResponse, readSavedPlayer, skillNames } from '../src/player/profile.ts';
import { createPlayerTransport, PlayerLookupError } from '../src/player/playerTransport.ts';
import { createPlayerData } from '../src/player/playerData.ts';

const now = Date.parse('2026-11-16T12:00:00Z');
const response = (username = 'test player', skills = { smithing: { level: 35, rank: -1 } }) => ({
  username, displayName: username, latestSnapshot: { createdAt: new Date(now - 1000).toISOString(), data: { skills } },
});
const profile = (username = 'test player') => readPlayerResponse(response(username), username, now);
const json = (data, status = 200, headers) => new Response(JSON.stringify(data), { status, headers });
const signal = () => new AbortController().signal;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const method = id => methods.find(method => method.id === id);

test('RSNs normalize underscores and surrounding whitespace and reject invalid names', () => {
  assert.equal(normalizeRsn('  Test_Player  '), 'Test Player');
  for (const name of ['A', 'Test Player', 'a-b', '123456789012']) assert.ok(isValidRsn(name));
  for (const name of ['', '1234567890123', 'a/b', '<script>', 'a\nb']) assert.equal(isValidRsn(name), false);
});

test('normalizes named skills including Runecraft and Sailing, caps levels and accepts unranked levels', () => {
  const parsed = readPlayerResponse(response('test player', {
    runecrafting: { level: 77, rank: -1 }, sailing: { level: 1 }, mining: { level: 126 },
    fishing: { level: -1 }, cooking: { level: 0 }, magic: { level: '99' },
    attack: { level: 2.5 }, defence: { level: 127 }, overall: { level: 2000 },
  }), 'test player', now);
  assert.deepEqual(parsed.levels, { Mining: 99, Runecraft: 77, Sailing: 1 });
  assert.equal(parsed.fetchedAt, now);
});

test('rejects absent snapshots, malformed responses, mismatched players and entirely unknown levels', () => {
  for (const value of [null, {}, { ...response(), latestSnapshot: null },
    response('another'), response('test player', {}), response('test player', { mining: { level: -1 } }),
    { ...response(), latestSnapshot: { ...response().latestSnapshot, createdAt: 'bad' } }]) {
    assert.throws(() => readPlayerResponse(value, 'test player', now));
  }
});

test('saved profiles are versioned, validated and stripped to the needed fields', () => {
  const saved = { version: 1, profile: profile(), enabled: true };
  assert.deepEqual(readSavedPlayer(saved), saved);
  for (const value of [null, { ...saved, version: 2 }, { ...saved, enabled: 'yes' },
    { ...saved, profile: { ...saved.profile, levels: { Smithing: 100 } } },
    { ...saved, profile: { ...saved.profile, levels: {} } },
    { ...saved, profile: { ...saved.profile, fetchedAt: Infinity } },
    { ...saved, profile: { ...saved.profile, displayName: 'someone else' } }]) assert.equal(readSavedPlayer(value), null);
  assert.deepEqual(readSavedPlayer({ ...saved, secret: 'unused' }), saved);
});

test('eligibility checks exact primary and secondary boundaries without parsing notes or recommendations', () => {
  assert.equal(meetsSkillRequirements(method('cannonballs'), { Smithing: 34 }), false);
  assert.equal(meetsSkillRequirements(method('cannonballs'), { Smithing: 35 }), true);
  assert.equal(meetsSkillRequirements(method('cannonballs'), {}), true);
  assert.equal(meetsSkillRequirements(method('sacred-eels'), { Fishing: 87, Cooking: 71 }), false);
  assert.equal(meetsSkillRequirements(method('sacred-eels'), { Fishing: 87, Cooking: 72 }), true);
  assert.equal(meetsSkillRequirements(method('sacred-eels'), { Fishing: 99 }), true);
  for (const id of ['barbarian-fishing', 'barbarian-fishing-fish-barrel']) {
    assert.equal(meetsSkillRequirements(method(id), { Fishing: 70, Agility: 45, Strength: 44 }), false);
    assert.equal(meetsSkillRequirements(method(id), { Fishing: 70, Agility: 44, Strength: 45 }), false);
    assert.equal(meetsSkillRequirements(method(id), { Fishing: 70, Agility: 45, Strength: 45 }), true);
  }
  for (const [id, levels] of [
    ['ironwood-trees', { Woodcutting: 80, Sailing: 72 }],
    ['rosewood-trees', { Woodcutting: 92, Sailing: 79 }],
    ['seeking-dragon-arrows-engorged', { Woodcutting: 77, Fletching: 90 }],
  ]) {
    assert.equal(meetsSkillRequirements(method(id), levels), true);
    const secondary = Object.keys(method(id).additionalSkillRequirements)[0];
    assert.equal(meetsSkillRequirements(method(id), { ...levels, [secondary]: levels[secondary] - 1 }), false);
  }
  assert.equal(meetsSkillRequirements(method('gemstone-crab'), {}), true);
  assert.equal(meetsSkillRequirements(method('cooking-anglerfish'), { Cooking: 84 }), true);
  for (const entry of methods) {
    assert.ok(entry.skill === 'Combat' || skillNames.includes(entry.skill));
    for (const [skill, level] of Object.entries(entry.additionalSkillRequirements ?? {})) {
      assert.ok(skillNames.includes(skill));
      assert.ok(Number.isInteger(level) && level >= 1 && level <= 99);
    }
  }
});

test('unknown primary and secondary levels remain eligible unless another known requirement fails', () => {
  assert.equal(meetsSkillRequirements(method('sacred-eels'), {}), true);
  assert.equal(meetsSkillRequirements(method('sacred-eels'), { Cooking: 72 }), true);
  assert.equal(meetsSkillRequirements(method('sacred-eels'), { Cooking: 71 }), false);
  assert.equal(meetsSkillRequirements(method('sacred-eels'), { Fishing: 86 }), false);
  assert.equal(meetsSkillRequirements(method('barbarian-fishing'), { Fishing: 70, Agility: 45 }), true);
  assert.equal(meetsSkillRequirements(method('barbarian-fishing'), { Agility: 44, Strength: 45 }), false);
});

test('transport POSTs an encoded RSN, without credentials, and reads the response', async () => {
  const transport = createPlayerTransport(async (url, options) => {
    assert.equal(url, 'https://api.wiseoldman.net/v2/players/test%20player');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'omit');
    return json(response());
  }, () => now);
  assert.deepEqual(await transport.load('test player', signal()), { profile: profile() });
});

test('429 makes exactly one GET fallback and preserves the existing snapshot time with a warning', async () => {
  const calls = [];
  const transport = createPlayerTransport(async (_url, options) => {
    calls.push(options.method);
    return options.method === 'POST' ? json({}, 429, { 'Retry-After': '120' }) : json(response());
  }, () => now);
  const result = await transport.load('test player', signal());
  assert.deepEqual(calls, ['POST', 'GET']);
  assert.equal(result.retryAt, now + 120_000);
  assert.match(result.warning, /existing saved snapshot/);
  assert.equal(result.profile.snapshotAt, response().latestSnapshot.createdAt);
});

test('failed rate-limit fallback retains the rate error and defaults to 60 seconds', async () => {
  let calls = 0;
  const transport = createPlayerTransport(async () => ++calls === 1 ? json({}, 429) : json({}, 404), () => now);
  await assert.rejects(transport.load('test player', signal()), error => error.retryAt === now + 60_000);
  assert.equal(calls, 2);
});

test('Retry-After handles HTTP dates, zero seconds and malformed headers', async () => {
  for (const [header, delay] of [[new Date(now + 90_000).toUTCString(), 90_000], ['0', 0], ['-1', 60_000], ['invalid', 60_000]]) {
    const transport = createPlayerTransport(async (_url, options) => options.method === 'POST'
      ? json({}, 429, { 'Retry-After': header }) : json(response()), () => now);
    const result = await transport.load('test player', signal());
    assert.equal(result.retryAt, now + delay);
  }
});

test('transport reports invalid responses, network, missing, rejected, unranked and service failures', async () => {
  for (const [fetcher, message] of [
    [async () => { throw new Error('offline'); }, /connection/],
    [async () => json({}, 404), /not found/],
    [async () => json({}, 403), /declined tracking/],
    [async () => json({}, 400), /unranked/],
    [async () => json({}, 503), /temporarily unavailable/],
    [async () => new Response('bad json'), /invalid response/],
    [async () => json({}), /No usable levels/],
  ]) await assert.rejects(createPlayerTransport(fetcher).load('test player', signal()), message);
});

test('transport deadline and caller cancellation settle even a fetch that ignores abort', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let attemptSignal;
  const transport = createPlayerTransport(async (_url, options) => {
    attemptSignal = options.signal;
    return new Promise(() => {});
  });
  const timed = assert.rejects(transport.load('test player', signal()), /timed out/);
  t.mock.timers.tick(15_000);
  await timed;
  assert.equal(attemptSignal.aborted, true);
  const caller = new AbortController();
  const cancelled = assert.rejects(transport.load('test player', caller.signal), /cancelled/);
  caller.abort();
  await cancelled;
  assert.equal(attemptSignal.aborted, true);
});

test('deadline covers reading a response body and an already-cancelled lookup never fetches', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const bodyStarted = deferred();
  let calls = 0;
  const transport = createPlayerTransport(async () => {
    calls++;
    return { ok: true, status: 200, json: () => { bodyStarted.resolve(); return new Promise(() => {}); } };
  });
  const timed = assert.rejects(transport.load('test player', signal()), /timed out/);
  await bodyStarted.promise;
  t.mock.timers.tick(15_000);
  await timed;
  const caller = new AbortController();
  caller.abort();
  await assert.rejects(transport.load('test player', caller.signal), /cancelled/);
  assert.equal(calls, 1);
});

test('restores without requests, updates and persists the profile and filter, and survives unavailable storage', async t => {
  let calls = 0;
  let persisted;
  let time = now + 60_000;
  const player = createPlayerData({ load: async () => { calls++; return { profile: profile() }; } }, {
    saved: { version: 1, profile: profile(), enabled: true }, now: () => time,
    persist: value => { persisted = value; },
  });
  t.after(player.start());
  assert.equal(calls, 0);
  assert.equal(player.getSnapshot().saved, true);
  await player.load('Test_Player');
  assert.equal(calls, 1);
  assert.equal(player.getSnapshot().saved, false);
  assert.equal(player.getSnapshot().enabled, true);
  player.setEnabled(false);
  assert.equal(persisted.enabled, false);
  await player.load('test player');
  assert.equal(calls, 1);
  assert.match(player.getSnapshot().message, /wait 60 seconds/);
  time += 60_000;
  await player.load('test player');
  assert.equal(calls, 2);
  player.clear();
  assert.equal(persisted, null);
  assert.equal(player.getSnapshot().profile, null);
  assert.equal(player.getSnapshot().enabled, false);
  const restricted = createPlayerData({ load: async () => ({ profile: profile() }) }, {
    persist: () => { throw new Error('denied'); },
  });
  t.after(restricted.start());
  await restricted.load('test player');
  assert.equal(restricted.getSnapshot().status, 'ready');
  restricted.setEnabled(true);
  restricted.clear();
});

test('invalid RSNs do not fetch; filtering cannot be enabled without a player', async t => {
  const player = createPlayerData({ load: async () => { assert.fail('unexpected request'); } });
  t.after(player.start());
  player.setEnabled(true);
  assert.equal(player.getSnapshot().enabled, false);
  await player.load('/invalid');
  assert.match(player.getSnapshot().message, /Enter an RSN/);
});

test('duplicates are suppressed and late results cannot replace a newer player', async t => {
  const requests = [];
  const player = createPlayerData({ load: (username, signal) => {
    const gate = deferred();
    requests.push({ ...gate, username, signal });
    return gate.promise;
  } });
  t.after(player.start());
  const first = player.load('First');
  await player.load('FIRST');
  assert.equal(requests.length, 1);
  const second = player.load('Second');
  assert.equal(requests[0].signal.aborted, true);
  requests[1].resolve({ profile: profile('second') });
  await second;
  requests[0].resolve({ profile: profile('first') });
  await first;
  assert.equal(player.getSnapshot().profile.username, 'second');
});

test('clear and cleanup cancel requests and ignore both late success and failure after restarting', async () => {
  for (const action of ['clear', 'stop']) {
    const gates = [];
    const player = createPlayerData({ load: (_username, signal) => {
      const gate = deferred();
      gates.push({ ...gate, signal });
      return gate.promise;
    } });
    const stop = player.start();
    const pending = player.load('first');
    if (action === 'clear') player.clear(); else stop();
    assert.equal(gates[0].signal.aborted, true);
    const stopAgain = player.start();
    const next = player.load('second');
    gates[0].reject(new Error('late error'));
    await pending;
    assert.equal(player.getSnapshot().status, 'loading');
    gates[1].resolve({ profile: profile('second') });
    await next;
    assert.equal(player.getSnapshot().profile.username, 'second');
    stopAgain();
  }
});

test('refresh and replacement failures retain the active profile, enabled filter and persisted snapshot', async t => {
  const old = profile();
  let persisted;
  const player = createPlayerData({ load: async () => { throw new Error('request failed'); } }, {
    saved: { version: 1, profile: old, enabled: true }, now: () => now + 60_000,
    persist: value => { persisted = value; },
  });
  t.after(player.start());
  for (const name of ['test player', 'another']) {
    await player.load(name);
    assert.equal(player.getSnapshot().status, 'error');
    assert.deepEqual(player.getSnapshot().profile, old);
    assert.equal(player.getSnapshot().enabled, true);
    assert.match(player.getSnapshot().message, /request failed/);
    assert.equal(persisted, undefined);
  }
});

test('rate-limit cooldown prevents requests across players and allows explicit retry after expiry', async t => {
  for (const fallback of [true, false]) {
    let time = now;
    let calls = 0;
    const player = createPlayerData({ load: async () => {
      calls++;
      if (!fallback) throw new PlayerLookupError('limited', time + 120_000);
      return { profile: profile(), retryAt: time + 120_000, warning: 'existing snapshot' };
    } }, { now: () => time });
    t.after(player.start());
    await player.load('test player');
    if (fallback) assert.match(player.getSnapshot().message, /existing snapshot/);
    await player.load('another');
    assert.equal(calls, 1);
    assert.match(player.getSnapshot().message, /wait 120 seconds/);
    time += 120_000;
    await player.load('test player');
    assert.equal(calls, 2);
  }
});
