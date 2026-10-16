/*! coi-serviceworker v0.1.7 - Guido Zuidhof and contributors, licensed under MIT */
/* Cutting Lab extension: verify and cache only pinned, same-scope solver assets.
   The upstream isolation headers and registration behavior are retained. */
let coepCredentialless = false;
if (typeof window === 'undefined') {
    const solverVersion = '649fd65233ee';
    const solverAssets = {
        'packingsolver.js': { bytes: 115288, sha256: '27a920820ebd0f537466843f83cd026946ece227e92f4ba34c9967cc4c6fd5a3' },
        'packingsolver.wasm': { bytes: 7444974, sha256: '2b9acda0c13db8c2e75e8cff4d4658d6770b5015fdd2a7c5ac4b1dd8d860924e' },
    };
    const solverScope = new URL(self.registration.scope);
    const solverCacheName = 'cutting-lab-solver:' + encodeURIComponent(solverScope.href) + ':' + solverVersion;
    const solverInflight = new Map();

    async function optionalCacheOperation(operation) {
        let timer;
        try {
            return await Promise.race([
                operation,
                new Promise((_, reject) => { timer = setTimeout(() => reject(Error('资源缓存暂时不可用')), 1000); }),
            ]);
        } finally { clearTimeout(timer); }
    }

    function pinnedSolverAsset(request) {
        if (request.method !== 'GET') return null;
        const url = new URL(request.url);
        if (url.origin !== solverScope.origin || url.searchParams.get('v') !== solverVersion) return null;
        for (const [name, expected] of Object.entries(solverAssets)) {
            const canonical = new URL('vendor/packingsolver/' + name, solverScope);
            if (url.pathname !== canonical.pathname) continue;
            // Worker recovery can append retry=1/2. All requests still refer to
            // the same hash-pinned release and share one download/cache entry.
            canonical.searchParams.set('v', solverVersion);
            return { name, expected, key: canonical.href };
        }
        return null;
    }

    async function verifySolverAsset(response, asset) {
        if (!response.ok) throw Error('HTTP ' + response.status);
        const type = response.headers.get('Content-Type') || '';
        if (/text\/html|application\/xhtml\+xml/i.test(type)) throw Error('资源返回了网页内容');
        if (asset.name.endsWith('.js') && !/(?:application|text)\/(?:x-)?(?:java|ecma)script\b/i.test(type)) {
            throw Error('计算脚本响应类型无效');
        }
        const bytes = await response.clone().arrayBuffer();
        if (bytes.byteLength !== asset.expected.bytes) throw Error('计算资源长度校验失败');
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (actual !== asset.expected.sha256) throw Error('计算资源完整性校验失败');
        return response;
    }

    async function downloadSolverAsset(request, asset) {
        let cache = null;
        // CacheStorage may be disabled or full. A verified network response is
        // still usable, and no history or cache belonging to another app is touched.
        try {
            cache = await optionalCacheOperation(caches.open(solverCacheName));
            const cached = await optionalCacheOperation(cache.match(asset.key));
            if (cached) {
                try { return await verifySolverAsset(cached, asset); }
                catch { try { await optionalCacheOperation(cache.delete(asset.key)); } catch {} }
            }
        } catch {}

        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
            if (attempt) await new Promise(resolve => setTimeout(resolve, attempt * 250));
            const controller = new AbortController();
            let timer;
            let retryable = true;
            try {
                const response = await Promise.race([
                    (async () => {
                        const fetched = await fetch(request, {
                            signal: controller.signal,
                            cache: attempt ? 'reload' : request.cache,
                        });
                        if (!fetched.ok) {
                            retryable = fetched.status >= 500 || fetched.status === 408 || fetched.status === 429;
                            throw Error('HTTP ' + fetched.status);
                        }
                        return verifySolverAsset(fetched, asset);
                    })(),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => {
                            controller.abort();
                            reject(Error('计算资源下载超时'));
                        }, 12000);
                    }),
                ]);
                // Cache writes are optional. Their failure must not turn a
                // successfully verified download into a failed solve.
                if (cache) try { await optionalCacheOperation(cache.put(asset.key, response.clone())); } catch {}
                return response;
            } catch (error) {
                lastError = error;
                if (!retryable) break;
            } finally { clearTimeout(timer); }
        }
        throw Error(asset.name + '：' + (lastError?.message || '网络请求失败'));
    }

    async function reliableFetch(request) {
        const asset = pinnedSolverAsset(request);
        if (!asset) return fetch(request);
        if (!solverInflight.has(asset.key)) {
            const task = downloadSolverAsset(request, asset).finally(() => solverInflight.delete(asset.key));
            solverInflight.set(asset.key, task);
        }
        // Response bodies are single-use; each Worker receives its own stream.
        return (await solverInflight.get(asset.key)).clone();
    }

    function isolationResponse(response) {
        if (response.status === 0) return response;
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Cross-Origin-Embedder-Policy', coepCredentialless ? 'credentialless' : 'require-corp');
        if (!coepCredentialless) newHeaders.set('Cross-Origin-Resource-Policy', 'cross-origin');
        newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: newHeaders,
        });
    }

    self.addEventListener("install", () => self.skipWaiting());
    self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

    self.addEventListener("message", (ev) => {
        if (!ev.data) {
            return;
        } else if (ev.data.type === "deregister") {
            self.registration
                .unregister()
                .then(() => {
                    return self.clients.matchAll();
                })
                .then(clients => {
                    clients.forEach((client) => client.navigate(client.url));
                });
        } else if (ev.data.type === "coepCredentialless") {
            coepCredentialless = ev.data.value;
        }
    });

    self.addEventListener("fetch", function (event) {
        const r = event.request;
        if (r.cache === "only-if-cached" && r.mode !== "same-origin") {
            return;
        }

        const request = (coepCredentialless && r.mode === "no-cors")
            ? new Request(r, {
                credentials: "omit",
            })
            : r;
        event.respondWith(
            reliableFetch(request)
                .then(isolationResponse)
                .catch((error) => {
                    console.error(error);
                    return isolationResponse(new Response(JSON.stringify({
                        error: '计算资源暂时无法加载，请重试。',
                        detail: error?.message || '网络请求失败',
                    }), {
                        status: 503,
                        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '2' },
                    }));
                })
        );
    });

} else {
    (() => {
        const reloadedBySelf = window.sessionStorage.getItem("coiReloadedBySelf");
        window.sessionStorage.removeItem("coiReloadedBySelf");
        const coepDegrading = (reloadedBySelf == "coepdegrade");

        // You can customize the behavior of this script through a global `coi` variable.
        const coi = {
            shouldRegister: () => !reloadedBySelf,
            shouldDeregister: () => false,
            coepCredentialless: () => true,
            coepDegrade: () => true,
            doReload: () => window.location.reload(),
            quiet: false,
            ...window.coi
        };

        const n = navigator;
        const controlling = n.serviceWorker && n.serviceWorker.controller;

        // Record the failure if the page is served by serviceWorker.
        if (controlling && !window.crossOriginIsolated) {
            window.sessionStorage.setItem("coiCoepHasFailed", "true");
        }
        const coepHasFailed = window.sessionStorage.getItem("coiCoepHasFailed");

        if (controlling) {
            // Reload only on the first failure.
            const reloadToDegrade = coi.coepDegrade() && !(
                coepDegrading || window.crossOriginIsolated
            );
            n.serviceWorker.controller.postMessage({
                type: "coepCredentialless",
                value: (reloadToDegrade || coepHasFailed && coi.coepDegrade())
                    ? false
                    : coi.coepCredentialless(),
            });
            if (reloadToDegrade) {
                !coi.quiet && console.log("Reloading page to degrade COEP.");
                window.sessionStorage.setItem("coiReloadedBySelf", "coepdegrade");
                coi.doReload("coepdegrade");
                return;
            }

            if (coi.shouldDeregister()) {
                n.serviceWorker.controller.postMessage({ type: "deregister" });
            }
        }

        // Returning visitors may already be isolated by our old worker. Still
        // register this version so loader fixes reach them without clearing data.
        // Leave another application's controller and native isolation alone.
        const scriptURL = new URL(window.document.currentScript.src, window.location.href);
        let ownController = false;
        if (controlling?.scriptURL) {
            const controllerURL = new URL(controlling.scriptURL, window.location.href);
            ownController = controllerURL.origin === scriptURL.origin && controllerURL.pathname === scriptURL.pathname;
        }
        if (!coi.shouldRegister() || (window.crossOriginIsolated !== false && !ownController)) return;

        if (!window.isSecureContext) {
            !coi.quiet && console.log("COOP/COEP Service Worker not registered, a secure context is required.");
            return;
        }

        // In some environments (e.g. Firefox private mode) this won't be available
        if (!n.serviceWorker) {
            !coi.quiet && console.error("COOP/COEP Service Worker not registered, perhaps due to private mode.");
            return;
        }

        let reloadRequested = false;
        const reloadForIsolation = () => {
            // An already isolated page can keep its inputs and active task.
            // A first visit reloads only after the new worker actually controls it.
            if (window.crossOriginIsolated !== false || reloadRequested || reloadedBySelf === 'controllerchange') return;
            reloadRequested = true;
            window.sessionStorage.setItem('coiReloadedBySelf', 'controllerchange');
            coi.doReload();
        };
        n.serviceWorker.addEventListener('controllerchange', reloadForIsolation);
        n.serviceWorker.register(scriptURL.href).then(
            (registration) => {
                !coi.quiet && console.log("COOP/COEP Service Worker registered", registration.scope);
                // controllerchange may have happened before register resolved.
                if (n.serviceWorker.controller) reloadForIsolation();
            },
            (err) => {
                !coi.quiet && console.error("COOP/COEP Service Worker failed to register:", err);
            }
        );
    })();
}
