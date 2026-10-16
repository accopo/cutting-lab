'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../static/solver-worker.js');

const base = 'https://accopo.github.io/cutting-lab/solver-worker.js?v=ui-release';
const source = fs.readFileSync(path.join(__dirname, '../static/solver-worker.js'), 'utf8');
const wasm = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0);
const js = 'var PackingSolver = function () { return Promise.resolve({}); };';
const networkError = () => new DOMException('Failed to load the engine script', 'NetworkError');

test('engine URL preserves the GitHub Pages project path and pins the solver version', () => {
  const url = new URL(C.engineURL('packingsolver.js', base));
  assert.equal(url.origin, 'https://accopo.github.io');
  assert.equal(url.pathname, '/cutting-lab/vendor/packingsolver/packingsolver.js');
  assert.equal(url.searchParams.get('v'), C.COMMIT.slice(0, 12));
  assert.equal(url.searchParams.has('retry'), false);
  assert.equal(url.searchParams.has('ui-release'), false);
  assert.equal(C.ENGINE_VERSION, C.COMMIT.slice(0, 12));
});

test('retry URLs keep the same asset and version while bypassing a failed request', () => {
  const url = new URL(C.engineURL('packingsolver.js', base, 2));
  assert.equal(url.pathname, '/cutting-lab/vendor/packingsolver/packingsolver.js');
  assert.equal(url.searchParams.get('v'), C.ENGINE_VERSION);
  assert.equal(url.searchParams.get('retry'), '2');
  assert.equal(new URL(C.engineURL('packingsolver.wasm', 'http://localhost:8768/')).pathname,
    '/vendor/packingsolver/packingsolver.wasm');
});

test('a successful synchronous script import is attempted once', () => {
  const calls = [];
  C.importEngineScript(url => calls.push(url), base);
  assert.deepEqual(calls, [C.engineURL('packingsolver.js', base)]);
});

for (const [kind, error] of [['NetworkError', networkError], ['TypeError', () => new TypeError('network failed')]]) {
  test(`script import retries one ${kind} failure and returns after recovery`, () => {
    const calls = [];
    C.importEngineScript(url => {
      calls.push(url);
      if (calls.length === 1) throw error();
    }, base);
    assert.deepEqual(calls, [C.engineURL('packingsolver.js', base), C.engineURL('packingsolver.js', base, 1)]);
  });
}

test('persistent script network failures stop after three attempts with an actionable error', () => {
  const calls = [];
  assert.throws(() => C.importEngineScript(url => {
    calls.push(url);
    throw networkError();
  }, base), /packingsolver\.js.*Ctrl\+F5.*Failed to load the engine script/);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(url => new URL(url).searchParams.get('retry')), [null, '1', '2']);
});

for (const error of [new SyntaxError('Unexpected token'), new Error('module execution failed')]) {
  test(`${error.name} during script evaluation is reported without retrying broken code`, () => {
    let attempts = 0;
    assert.throws(() => C.importEngineScript(() => {
      attempts++;
      throw error;
    }, base), e => e.message.includes(error.message));
    assert.equal(attempts, 1);
  });
}

test('a valid WASM response returns its bytes and requests a versioned, revalidated asset', async () => {
  let request;
  const result = await C.fetchEngineAsset(async (url, options) => {
    request = { url, options };
    return new Response(wasm, { headers: { 'Content-Type': 'application/wasm' } });
  }, base, 'packingsolver.wasm');
  assert.deepEqual(result, wasm);
  assert.equal(WebAssembly.validate(result), true);
  assert.equal(request.url, C.engineURL('packingsolver.wasm', base));
  assert.equal(request.options.cache, 'no-cache');
  assert.equal(request.options.signal.aborted, false);
});

for (const type of ['text/javascript; charset=utf-8', 'application/javascript', 'application/ecmascript']) {
  test(`valid JS accepts the ${type} response type`, async () => {
    const result = await C.fetchEngineAsset(async () => new Response(js, {
      headers: { 'Content-Type': type },
    }), base, 'packingsolver.js');
    assert.equal(new TextDecoder().decode(result), js);
  });
}

test('HTTP 404 is reported before trying to evaluate the error body', async () => {
  await assert.rejects(C.fetchEngineAsset(async () => new Response('<html>Not found</html>', {
    status: 404, headers: { 'Content-Type': 'text/html' },
  }), base, 'packingsolver.js'), /packingsolver\.js.*HTTP 404.*Ctrl\+F5/);
});

test('an HTML fallback page cannot be used as the JS engine', async () => {
  await assert.rejects(C.fetchEngineAsset(async () => new Response('<html>Proxy error</html>', {
    headers: { 'Content-Type': 'text/html' },
  }), base, 'packingsolver.js'), /不是 JavaScript 脚本/);
});

test('a script response without a JavaScript MIME type is rejected', async () => {
  await assert.rejects(C.fetchEngineAsset(async () => new Response(js, {
    headers: { 'Content-Type': 'text/plain' },
  }), base, 'packingsolver.js'), /不是 JavaScript 脚本/);
});

for (const [label, bytes] of [
  ['HTML returned as WASM', new TextEncoder().encode('<html>Proxy error</html>')],
  ['truncated WASM header', wasm.slice(0, 7)],
  ['corrupted WASM magic', Uint8Array.of(1, 97, 115, 109, 1, 0, 0, 0)],
]) {
  test(`${label} is rejected with the asset name`, async () => {
    await assert.rejects(C.fetchEngineAsset(async () => new Response(bytes), base, 'packingsolver.wasm'),
      /packingsolver\.wasm.*不是 WebAssembly 模块/);
  });
}

test('fetch rejection is translated into an actionable engine-file error', async () => {
  await assert.rejects(C.fetchEngineAsset(async () => { throw new TypeError('Failed to fetch'); },
    base, 'packingsolver.wasm'), /packingsolver\.wasm.*Failed to fetch.*Ctrl\+F5/);
});

function abortableFetch(signals) {
  return async (url, { signal }) => {
    signals.push(signal);
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('The operation was aborted', 'AbortError'));
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });
  };
}

test('a pre-aborted caller signal cancels loading and is distinguished from timeout', async () => {
  const controller = new AbortController(), signals = [];
  controller.abort();
  await assert.rejects(C.fetchEngineAsset(abortableFetch(signals), base, 'packingsolver.wasm', controller.signal),
    /引擎加载已停止/);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, true);
});

test('stopping during a download aborts the actual fetch request', async () => {
  const controller = new AbortController(), signals = [];
  const pending = C.fetchEngineAsset(abortableFetch(signals), base, 'packingsolver.wasm', controller.signal);
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, false);
  controller.abort();
  await assert.rejects(pending, /引擎加载已停止/);
  assert.equal(signals[0].aborted, true);
});

test('caller abort listeners are removed after both successful and failed downloads', async () => {
  for (const fail of [false, true]) {
    let added, removed;
    const signal = {
      aborted: false,
      addEventListener(type, handler, options) { added = { type, handler, options }; },
      removeEventListener(type, handler) { removed = { type, handler }; },
    };
    const pending = C.fetchEngineAsset(async () => {
      if (fail) throw new Error('offline');
      return new Response(wasm);
    }, base, 'packingsolver.wasm', signal);
    if (fail) await assert.rejects(pending, /offline/);
    else await pending;
    assert.equal(added.type, 'abort');
    assert.equal(added.options.once, true);
    assert.equal(removed.type, 'abort');
    assert.equal(removed.handler, added.handler);
  }
});

test('the bounded download timeout aborts fetch and reports timeout rather than user cancellation', async () => {
  const timers = [], cleared = [];
  const context = vm.createContext({
    URL, AbortController, Uint8Array,
    setTimeout(callback, milliseconds) {
      timers.push(milliseconds);
      queueMicrotask(callback);
      return 42;
    },
    clearTimeout(id) { cleared.push(id); },
  });
  vm.runInContext(source, context);
  const signals = [];
  await assert.rejects(context.CuttingSolverCore.fetchEngineAsset(abortableFetch(signals), base, 'packingsolver.wasm'),
    /下载超时/);
  assert.deepEqual(timers, [45000]);
  assert.deepEqual(cleared, [42]);
  assert.equal(signals[0].aborted, true);
});

function pthreadContext(importer) {
  const context = {
    name: 'em-pthread', location: { href: base }, URL,
    importScripts: importer,
  };
  context.self = context;
  return vm.createContext(context);
}

test('pthread bootstrap synchronously installs the official message handler before returning', () => {
  const calls = [];
  const officialHandler = () => {};
  let context;
  context = pthreadContext(url => {
    calls.push(url);
    context.onmessage = officialHandler;
  });
  vm.runInContext(source, context);
  assert.deepEqual(calls, [C.engineURL('packingsolver.js', base)]);
  assert.equal(context.onmessage, officialHandler);
  assert.equal(context.CuttingGeometry, undefined);
});

test('pthread bootstrap recovers a first import network failure synchronously', () => {
  const calls = [];
  const officialHandler = () => {};
  let context;
  context = pthreadContext(url => {
    calls.push(url);
    if (calls.length === 1) throw networkError();
    context.onmessage = officialHandler;
  });
  vm.runInContext(source, context);
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).searchParams.get('retry'), '1');
  assert.equal(context.onmessage, officialHandler);
});

test('pthread bootstrap surfaces exhausted imports without installing the solver job loop', () => {
  let calls = 0;
  const context = pthreadContext(() => { calls++; throw networkError(); });
  assert.throws(() => vm.runInContext(source, context), /packingsolver\.js 加载失败/);
  assert.equal(calls, 3);
  assert.equal(context.onmessage, undefined);
});
