'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const feed = require('../service/web/js/app.js');

test('fleet summary and filters keep online state and search consistent', () => {
  const servers = [
    { name: 'Shanghai Core', location: 'CN', type: 'kvm', online4: true },
    { name: 'Frankfurt Edge', location: 'DE', type: 'dedicated', online4: false, online6: false },
    { name: 'London Relay', location: 'UK', type: 'kvm', online6: true }
  ];

  assert.deepEqual(feed.fleetSummary(servers), { total: 3, online: 2, offline: 1, health: 67 });
  assert.deepEqual(feed.filterServers(servers, 'offline', '').map((server) => server.name), ['Frankfurt Edge']);
  assert.deepEqual(feed.filterServers(servers, 'online', 'london').map((server) => server.name), ['London Relay']);
  assert.deepEqual(feed.filterServers(servers, 'all', 'dedicated').map((server) => server.name), ['Frankfurt Edge']);
});

test('layout choice defaults safely and classic rows keep the dense status model', () => {
  assert.equal(feed.normalizeLayout('classic'), 'classic');
  assert.equal(feed.normalizeLayout('modern'), 'modern');
  assert.equal(feed.normalizeLayout('unknown'), 'modern');
  assert.equal(feed.initialLayout(null), 'classic');
  assert.equal(feed.initialLayout('modern'), 'modern');

  const html = feed.classicRow({
    name: '<Edge>', location: 'de', type: 'kvm', online4: true, online6: true,
    uptime: 86460, load_1: 0.12, cpu: 24,
    memory_used: 50, memory_total: 100, hdd_used: 75, hdd_total: 100,
    network_rx: 1024, network_tx: 2048, network_in: 4096, network_out: 8192,
    last_network_in: 1024, last_network_out: 2048,
    ping_10010: 0, ping_189: 2, ping_10086: 0,
    time_10010: 25, time_189: 30, time_10086: 28
  });

  assert.equal((html.match(/<td>/g) || []).length, 13);
  assert.match(html, />Dual</);
  assert.match(html, /carrier-cell warn/);
  assert.match(html, /&lt;Edge&gt;/);
  assert.doesNotMatch(html, /<Edge>/);
});

test('language follows the browser until a saved choice takes precedence', () => {
  assert.equal(feed.normalizeLanguage('zh-CN'), 'zh');
  assert.equal(feed.normalizeLanguage('en-US'), 'en');
  assert.equal(feed.initialLanguage(null, 'zh-TW'), 'zh');
  assert.equal(feed.initialLanguage(null, 'fr-FR'), 'en');
  assert.equal(feed.initialLanguage('en', 'zh-CN'), 'en');
  assert.equal(feed.translate('zh', 'status.offline'), '离线');
  assert.equal(feed.translate('en', 'metric.reporting', { online: 2, total: 3 }), '2 of 3 nodes reporting');

  const failed = {
    data: { servers: [] },
    lastSuccess: 1000,
    sourceUpdated: null,
    error: new Error('down')
  };
  assert.equal(feed.feedNotice(failed, 5000, 30000, 'zh').text, '数据不可用 · 正在显示 4 秒前的数据');
});

test('fetchStats rejects non-success HTTP responses', async () => {
  let parsed = false;
  const response = {
    ok: false,
    status: 503,
    json: () => { parsed = true; return Promise.resolve({ servers: [] }); }
  };

  await assert.rejects(
    feed.fetchStats(() => Promise.resolve(response), 100),
    /stats HTTP 503/
  );
  assert.equal(parsed, false);
});

test('feed state retains the last data on failure and clears the error on recovery', () => {
  const empty = { data: null, lastSuccess: null, sourceUpdated: null, error: null };
  const firstData = { servers: [{ name: 'a' }] };
  const recoveredData = { servers: [{ name: 'b' }] };
  const good = feed.updateFeedState(empty, { ok: true, data: firstData }, 1000);
  const failed = feed.updateFeedState(good, { ok: false, error: new Error('down') }, 5000);

  assert.strictEqual(failed.data, firstData);
  assert.equal(failed.lastSuccess, 1000);
  assert.match(feed.feedNotice(failed, 5000, 30000).text, /using data from 4s ago/);

  const recovered = feed.updateFeedState(failed, { ok: true, data: recoveredData }, 6000);
  assert.strictEqual(recovered.data, recoveredData);
  assert.equal(recovered.error, null);
  assert.equal(feed.feedNotice(recovered, 6000, 30000).kind, 'ok');
});

test('stale detection accepts seconds or milliseconds and tolerates missing updated', () => {
  assert.equal(feed.updatedMillis(1700000000), 1700000000000);
  assert.equal(feed.updatedMillis(1700000000000), 1700000000000);

  const now = 1700000040000;
  const stale = feed.updateFeedState(
    { data: null, lastSuccess: null, sourceUpdated: null, error: null },
    { ok: true, data: { servers: [], updated: 1700000000 } },
    now
  );
  assert.equal(feed.feedNotice(stale, now, 30000).kind, 'stale');

  const missing = feed.updateFeedState(stale, { ok: true, data: { servers: [] } }, now);
  assert.equal(missing.sourceUpdated, null);
  assert.equal(feed.feedNotice(missing, now + 1000, 30000).kind, 'ok');
});

test('fetch failure reports source age when the previous payload was already stale', () => {
  const now = 1700000040000;
  const stale = feed.updateFeedState(
    { data: null, lastSuccess: null, sourceUpdated: null, error: null },
    { ok: true, data: { servers: [], updated: 1700000000 } },
    now
  );
  const failed = feed.updateFeedState(stale, { ok: false, error: new Error('down') }, now + 5000);

  const notice = feed.feedNotice(failed, now + 5000, 30000);
  assert.equal(notice.kind, 'error');
  assert.match(notice.text, /45s ago/);
});

test('poller never starts a second request while one is in flight', async () => {
  let fetchCalls = 0;
  let resolveFetch;
  const scheduled = [];
  const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });
  const poller = feed.createStatusPoller({
    fetch: () => { fetchCalls += 1; return fetchPromise; },
    now: () => 1000,
    interval: 1500,
    schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
    cancel: () => {},
    onData: () => {},
    onState: () => {}
  });

  const first = poller.start();
  const second = poller.run();
  assert.strictEqual(first, second);
  assert.equal(fetchCalls, 1);

  resolveFetch({ ok: true, status: 200, json: () => Promise.resolve({ servers: [] }) });
  await first;
  assert.equal(scheduled.length, 1);
  poller.stop();
});

test('hung fetch is aborted, retains old data, enters error, and schedules the next poll', async () => {
  let fetchCalls = 0;
  let hungSignal;
  const scheduled = [];
  const firstData = { servers: [{ name: 'a' }] };
  const poller = feed.createStatusPoller({
    fetch: (url, options) => {
      fetchCalls += 1;
      if (fetchCalls === 1) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(firstData) });
      }
      hungSignal = options.signal;
      return new Promise(() => {});
    },
    now: () => 1000,
    interval: 1500,
    timeout: 5,
    schedule: (callback) => { scheduled.push(callback); return scheduled.length; },
    cancel: () => {},
    onData: () => {},
    onState: () => {}
  });

  await poller.start();
  assert.strictEqual(poller.getState().data, firstData);

  await poller.run();
  assert.equal(hungSignal.aborted, true);
  assert.strictEqual(poller.getState().data, firstData);
  assert.match(poller.getState().error.message, /timed out/);
  assert.equal(scheduled.length, 2);
  poller.stop();
});
