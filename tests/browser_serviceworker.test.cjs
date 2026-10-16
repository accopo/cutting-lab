const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../static/coi-serviceworker.js'), 'utf8');
const scope = 'https://example.test/cutting-lab/';
const version = '649fd65233ee';
const solverURL = name => scope + 'vendor/packingsolver/' + name + '?v=' + version;
const jsBytes = fs.readFileSync(path.join(__dirname, '../static/vendor/packingsolver/packingsolver.js'));
const wasmBytes = fs.readFileSync(path.join(__dirname, '../static/vendor/packingsolver/packingsolver.wasm'));
const goodJS = () => new Response(jsBytes, { headers: { 'Content-Type': 'application/javascript' } });
const goodWasm = () => new Response(wasmBytes, { headers: { 'Content-Type': 'application/wasm' } });

function worker(fetcher, options = {}) {
    const handlers = new Map(), cacheRows = new Map(), requests = [], opened = [], deleted = [], logged = [];
    const cache = {
        async match(key) { return cacheRows.get(String(key))?.clone(); },
        async put(key, value) {
            if (options.putFails) throw Error('quota');
            if (options.putHangs) return new Promise(() => {});
            cacheRows.set(String(key), value.clone());
        },
        async delete(key) { deleted.push(String(key)); return cacheRows.delete(String(key)); },
    };
    const context = {
        self: { registration: { scope: options.scope || scope }, addEventListener: (name, fn) => handlers.set(name, fn),
            skipWaiting() {}, clients: { claim() {} } },
        URL, Headers, Request, Response, AbortController, Uint8Array, crypto: webcrypto,
        caches: { async open(name) { opened.push(name); if (options.openFails) throw Error('storage disabled'); if (options.openHangs) return new Promise(() => {}); return cache; } },
        fetch: async (request, init) => { requests.push({ request, init }); return fetcher(request, init, requests.length); },
        setTimeout: (fn, ms) => setTimeout(fn, ms === 12000 ? (options.timeoutMs || 2000) : 0),
        clearTimeout, console: { log() {}, error: value => logged.push(value) },
    };
    vm.runInNewContext(source, context, { filename: 'coi-serviceworker.js' });
    return { requests, opened, deleted, cacheRows, logged, handlers,
        async fetch(url = solverURL('packingsolver.js'), init) {
            let response;
            handlers.get('fetch')({ request: new Request(url, init), respondWith: value => { response = value; } });
            return response;
        },
    };
}

test('pinned JS recovers from a network failure, validates, and caches with isolation headers', async () => {
    const w = worker((request, init, attempt) => { if (attempt === 1) throw Error('offline'); return goodJS(); });
    const response = await w.fetch();
    assert.equal(response.status, 200);
    assert.equal(w.requests.length, 2);
    assert.equal(w.requests[1].init.cache, 'reload');
    assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'require-corp');
    assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
    assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), jsBytes);
    assert.equal(w.cacheRows.size, 1);
    assert.equal(w.logged.length, 0);
    assert.match(w.opened[0], new RegExp(encodeURIComponent(scope).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert(w.opened[0].endsWith(version));
    const cached = await w.fetch(solverURL('packingsolver.js') + '&retry=2');
    assert.equal(cached.status, 200);
    assert.equal(w.requests.length, 2);
});

test('validates real WASM bytes before reuse', async () => {
    const w = worker(goodWasm);
    const response = await w.fetch(solverURL('packingsolver.wasm'));
    assert.equal(response.status, 200);
    assert.equal((await response.arrayBuffer()).byteLength, 7444974);
    assert.equal(w.cacheRows.size, 1);
    assert.equal((await w.fetch(solverURL('packingsolver.wasm'))).status, 200);
    assert.equal(w.requests.length, 1);
});

test('32 simultaneous pthread requests share one fetch and receive independent bodies', async () => {
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const w = worker(async () => { await gate; return goodJS(); });
    const tasks = Array.from({ length: 32 }, (_, i) => w.fetch(solverURL('packingsolver.js') + (i % 2 ? '&retry=1' : '')));
    release();
    const responses = await Promise.all(tasks);
    assert.equal(w.requests.length, 1);
    const bytes = await Promise.all(responses.map(response => response.arrayBuffer()));
    assert(bytes.every(buffer => buffer.byteLength === jsBytes.length));
});

test('network/5xx/408/429 failures retry and permanent failure returns explicit isolated 503', async () => {
    for (const status of [500, 503, 408, 429]) {
        const w = worker(() => new Response('temporarily unavailable', { status }));
        const response = await w.fetch();
        assert.equal(response.status, 503);
        assert.equal(w.requests.length, 3);
        assert.equal(w.cacheRows.size, 0);
        assert.equal(response.headers.get('Cache-Control'), 'no-store');
        assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
        assert.match((await response.json()).detail, new RegExp('HTTP ' + status));
    }
    const w = worker(() => { throw Error('blocked network'); });
    assert.equal((await w.fetch()).status, 503);
    assert.equal(w.requests.length, 3);
});

test('404 does not waste retries or enter the cache', async () => {
    const w = worker(() => new Response('not found', { status: 404 }));
    const response = await w.fetch();
    assert.equal(response.status, 503);
    assert.match((await response.json()).detail, /HTTP 404/);
    assert.equal(w.requests.length, 1);
    assert.equal(w.cacheRows.size, 0);
});

test('HTML, wrong length and same-length wrong hash are never cached', async () => {
    const wrongHash = Buffer.from(jsBytes); wrongHash[0] ^= 1;
    for (const makeResponse of [
        () => new Response('<html>error</html>', { headers: { 'Content-Type': 'text/html' } }),
        () => new Response('tiny', { headers: { 'Content-Type': 'application/javascript' } }),
        () => new Response(wrongHash, { headers: { 'Content-Type': 'application/javascript' } }),
    ]) {
        const w = worker(makeResponse);
        assert.equal((await w.fetch()).status, 503);
        assert.equal(w.requests.length, 3);
        assert.equal(w.cacheRows.size, 0);
    }
});

test('a corrupt cache entry is replaced without deleting unrelated cached data', async () => {
    const w = worker(goodJS);
    w.cacheRows.set(solverURL('packingsolver.js'), new Response('bad cached content'));
    w.cacheRows.set(scope + 'unrelated-user-data', new Response('keep'));
    assert.equal((await w.fetch()).status, 200);
    assert.equal(w.requests.length, 1);
    assert.deepEqual(w.deleted, [solverURL('packingsolver.js')]);
    assert.equal(await w.cacheRows.get(scope + 'unrelated-user-data').text(), 'keep');
});

test('CacheStorage open or write rejection/stall never blocks a good network response', async () => {
    for (const options of [{ openFails: true }, { putFails: true }, { openHangs: true }, { putHangs: true }]) {
        const w = worker(goodJS, options);
        assert.equal((await w.fetch()).status, 200);
        assert.equal(w.requests.length, 1);
        assert.equal(w.cacheRows.size, 0);
    }
});

test('hung fetch is aborted per attempt; a later request can recover', async () => {
    let fail = true;
    const options = { timeoutMs: 5 };
    const w = worker(() => fail ? new Promise(() => {}) : goodJS(), options);
    const failed = await w.fetch();
    assert.equal(failed.status, 503);
    assert.equal(w.requests.length, 3);
    assert(w.requests.every(call => call.init.signal.aborted));
    fail = false;
    options.timeoutMs = 2000;
    assert.equal((await w.fetch()).status, 200);
    assert.equal(w.requests.length, 4);
});

test('other scopes, origins, methods, assets and versions remain uncached passthrough', async () => {
    const w = worker(() => new Response('ordinary response', { status: 202 }));
    const cases = [
        [solverURL('packingsolver.js').replace('example.test', 'external.test')],
        [solverURL('packingsolver.js').replace('/cutting-lab/', '/other-project/')],
        [solverURL('packingsolver.js').replace(version, 'another-version')],
        [scope + 'vendor/packingsolver/packingsolver.js'],
        [scope + 'app.js?v=' + version],
        [solverURL('packingsolver.js'), { method: 'POST', body: 'user data' }],
    ];
    for (const [url, init] of cases) assert.equal((await w.fetch(url, init)).status, 202);
    assert.equal(w.requests.length, cases.length);
    assert.equal(w.opened.length, 0);
    assert.equal(w.cacheRows.size, 0);
    assert(w.requests.every(call => call.init === undefined));
});

test('passthrough network failure returns a 503 response instead of undefined', async () => {
    const w = worker(() => { throw Error('offline'); });
    assert.equal((await w.fetch(scope + 'app.js')).status, 503);
    assert.equal(w.requests.length, 1);
    assert.equal(w.opened.length, 0);
});

test('credentialless messages retain upstream isolation header behavior', async () => {
    const w = worker(() => new Response('ordinary response'));
    w.handlers.get('message')({ data: { type: 'coepCredentialless', value: true } });
    const response = await w.fetch(scope + 'app.js');
    assert.equal(response.headers.get('Cross-Origin-Embedder-Policy'), 'credentialless');
    assert.equal(response.headers.get('Cross-Origin-Resource-Policy'), null);
    assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
});

function page(options = {}) {
    const handlers = new Map(), registrations = [], storage = new Map(), messages = [];
    let reloads = 0;
    if (options.previousReload) storage.set('coiReloadedBySelf', options.previousReload);
    const controller = options.controller === false ? null : {
        scriptURL: options.controllerURL || scope + 'coi-serviceworker.js', postMessage: message => messages.push(message),
    };
    const serviceWorker = {
        controller,
        addEventListener: (name, fn) => handlers.set(name, fn),
        async register(url) { registrations.push(url); return { scope, active: {} }; },
    };
    const window = {
        location: { href: scope }, document: { currentScript: { src: scope + 'coi-serviceworker.js?v=20261016-load1' } },
        sessionStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        crossOriginIsolated: options.isolated !== false, isSecureContext: true,
        coi: { shouldRegister: () => options.register !== false, coepDegrade: () => false, quiet: true, doReload: () => { reloads++; } },
    };
    vm.runInNewContext(source, { window, navigator: { serviceWorker }, URL, console });
    return { handlers, registrations, messages, serviceWorker, storage, get reloads() { return reloads; } };
}

test('an already isolated returning visitor registers the new own-worker version without reloading', async () => {
    const p = page();
    await Promise.resolve();
    assert.deepEqual(p.registrations, [scope + 'coi-serviceworker.js?v=20261016-load1']);
    p.handlers.get('controllerchange')();
    assert.equal(p.reloads, 0);
});

test('first visit reloads once only after control arrives; repeated events do not loop', async () => {
    const p = page({ controller: false, isolated: false });
    await Promise.resolve();
    assert.equal(p.reloads, 0);
    p.serviceWorker.controller = { scriptURL: scope + 'coi-serviceworker.js' };
    p.handlers.get('controllerchange')();
    p.handlers.get('controllerchange')();
    assert.equal(p.reloads, 1);
    assert.equal(p.storage.get('coiReloadedBySelf'), 'controllerchange');
    const retry = page({ isolated: false, previousReload: 'controllerchange' });
    await Promise.resolve();
    retry.handlers.get('controllerchange')();
    assert.equal(retry.reloads, 0);
});

test('native opt-out, another app controller and server isolation do not register a replacement worker', async () => {
    for (const options of [
        { register: false },
        { controllerURL: 'https://example.test/another-app/coi-serviceworker.js' },
        { controllerURL: 'https://other.test/cutting-lab/coi-serviceworker.js' },
        { controller: false },
    ]) {
        const p = page(options);
        await Promise.resolve();
        assert.equal(p.registrations.length, 0);
        assert.equal(p.reloads, 0);
    }
});
