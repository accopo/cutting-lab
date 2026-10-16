# polygon-clipping 0.15.7

The unminified `polygon-clipping.umd.js` is copied without changes from the author's published npm release. It contains the original library implementation and its bundled dependencies. No CDN request is made at runtime.

- Official project: https://github.com/mfogel/polygon-clipping
- Exact release: https://registry.npmjs.org/polygon-clipping/-/polygon-clipping-0.15.7.tgz
- Release archive SHA-256: `23bdea671a65011107d91536881f527c8e2e6820f59e4bc1408a94d7cc11d5b7`
- UMD SHA-256: `de2bdc061b61d537f7d12f6519f46e35113f0f246b6a06293a08b615454946cf`
- Retrieved: 2026-10-16.
- Main license: `LICENSE.md` (MIT, Mike Fogel and Alexander Milevski).
- Bundled splaytree 3.1.2: `SPLAYTREE-LICENSE.txt`, copied from that version's published README license section (https://registry.npmjs.org/splaytree/-/splaytree-3.1.2.tgz).
- Bundled robust-predicates: `ROBUST-PREDICATES-LICENSE.txt` (public domain / Unlicense, from the separately pinned 3.0.2 release).
- Bundled Microsoft TypeScript runtime helper: Apache-2.0 notice retained in the unmodified UMD, full license in `APACHE-2.0.txt` (https://www.apache.org/licenses/LICENSE-2.0.txt).

`README.upstream.md` and `package.json` are original release metadata. This is floating-point geometry, with explicit application tolerances. The application also has an independent triangle-intersection fallback for clipping failures at nearly coincident boundaries; that fallback keeps the original coordinates.
