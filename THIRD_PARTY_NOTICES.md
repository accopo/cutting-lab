# Third-party notices

Original application code is MIT licensed except `static/solver-worker.js`, which is licensed under Apache-2.0 and explicitly marks its modified JavaScript port of rectpack 0.2.2 rules. The following components and data retain their own licenses and attribution. Commercial products mentioned in research reports are references, not bundled software, endorsements, or partnerships.

| Component | Version / source | License and retained notice |
| --- | --- | --- |
| PackingSolver browser runtime | commit `649fd65233ee93f50b69871f197779ace46db9f5`; official workflow `38660278943` | MIT, `static/vendor/packingsolver/LICENSE` |
| PackingSolver build dependencies | fixed upstream source references | `static/vendor/packingsolver/dependency-licenses/` and manifest |
| Three.js and OrbitControls | 0.180.0 | MIT, `static/vendor/three-0.180.0/LICENSE` |
| coi-serviceworker | 0.1.7 with Cutting Lab verified engine caching, bounded network retries and update recovery; upstream commit `7b1d2a092d0d2dd2b7270b6f12f13605de26f214` | MIT, `static/vendor/coi-serviceworker/LICENSE` |
| polygon-clipping | 0.15.7 | MIT and bundled dependency notices retained in its vendor directory |
| robust-predicates | 3.0.2 | Unlicense, retained in its vendor directory |
| rectpack selection / splitting rules | 0.2.2, JavaScript ports in solver-worker.js | Apache-2.0, `static/vendor/rectpack-LICENSE` |
| ESICUP normalized benchmark inputs | ESICUP XML at `154a8f006a8e72f65d734f2d1e36777f678f31f8` | CC0 1.0, `data/LICENSE-ESICUP` |

PackingSolver's fixed build dependencies include optimizationtools, shape, HiGHS, mathoptsolverscmake, knapsacksolver, multiplechoicesubsetsumsolver, subsetsumsolver, treesearchsolver, columngenerationsolver and nlohmann/json. Their source license texts are retained with pinned references. Emscripten, mimalloc, musl, libc++, libc++abi and compiler-rt runtime notices are also retained at version 6.0.11 source paths. LLVM runtime texts include their respective exceptions; these notices are not collectively described as MIT. The official generated JavaScript and WASM are unmodified; application integration is in separate files.

The Python environment is installed separately using `requirements-lock.txt`; Python wheels and the interpreter are not redistributed by this repository. Shapely and rectpack perform local validation / baseline computation under their respective upstream licenses.

The five public textile instances are historical geometric benchmarks, with unknown physical units. Source audit and source hashes are retained in `data/SOURCE_AUDIT.md` and `data/download_manifest.json`; the distributed normalized files are derived from the ESICUP XML variant. OR-Datasets is cited for the independent comparison described in the audit; its comparison files are not bundled here. See the source audit for original dataset authors and references.

Generated synthetic industry scenes are part of this project's demonstration code. No private production orders or user-created job history are included in the static distribution.

The static build copies this notice, the project LICENSE, ESICUP CC0 text, public normalized inputs, and both source/distribution audit files through an explicit allowlist. `data/download_manifest.json` is a historical retrieval receipt; its raw local paths do not assert that those files are bundled. The distributed normalized/browser JSON hashes and exact source URLs are in `data/distribution_source_audit.json`.
