# Cutting Lab API and runtime contract

The Chinese application has two execution modes. The native Python service listens on **http://127.0.0.1:8767** and stores jobs in the project's `jobs/` directory. `启动裁切实验室.vbs` starts that service after its environment is configured. The static browser edition runs genuine official PackingSolver WASM or explicitly identified JavaScript baselines in dedicated Workers, storing jobs and intermediate snapshots in IndexedDB for that browser and origin. The runtime probes `/api/health` and uses the native API when available; `?runtime=browser` forces browser execution. Public inputs and software assets are downloaded; submitted problem geometry and solve history are not uploaded by the static application.

The browser edition needs a secure context, service workers, WebAssembly threads, `crossOriginIsolated` and SharedArrayBuffer. The static site includes its own same-origin isolation service worker. Initialization may reload the page once; loading time is reported separately from the requested solving budget. Native-mode API availability does not depend on optional browser certificate-enhancement libraries.

## Problem: 1D and 2D

```json
{"id":"shirts","name":"Shirts 衬衫排料","industry":"apparel","kind":"irregular","unit":"benchmark","source":{"label":"ESICUP XML","kind":"public-benchmark","url":"https://github.com/ESICUP/datasets","note":"物理单位未知"},"items":[{"id":0,"name":"轮廓 1","quantity":8,"polygon":[[0,0],[5,0],[5,8],[0,8]],"allowed_rotations":[0,180],"profit":1}],"stock":{"width":1000,"height":40,"copies":20},"settings":{"engine":"irregular","objective":"strip","rotation":"source","custom_angles":[0,180],"spacing":0,"edge":0,"kerf":0,"time_limit":10,"stages":3,"first_cut":"vertical"},"defects":[]}
```

- `kind` is `irregular`, `rectangle` or `onedimensional` for these routes. Irregular items use a simple polygon; rectangles use width/height; 1D items use length. Optional rectangle/1D display polygons must match those dimensions.
- `stock.width` is maximum x length; `stock.height` is fixed y width. For 1D, width is stock length and height must be 1 for display only.
- Objective `strip` minimizes consumed x length on one strip; `bins` minimizes the number of equal stocks; `knapsack` maximizes selected item profit in **one** fixed stock. `effective_stock_copies` records 1 for strip/knapsack and available inventory for bins.
- Items have unique id, name, positive integer quantity, positive profit and original allowed_rotations in degrees. Original public geometry and directions remain in the catalog. The server identifies derived scenarios by comparison to source data, rather than trusting a client boolean.
- Rotation modes are `source,none,half,quarter,custom,continuous`. Continuous 0–360° ranges are supported only by the irregular route. Rectangle/guillotine/rectpack use axis-aligned directions; shelf uses finite discrete angles. Mirror settings are rejected.
- Defects are at most 20 rectangles `{x,y,width,height}`, fully inside the stock, repeated at the same locations on each stock. Nonrectangular defect geometry is rejected.

## Problem: 3D boxes

```json
{"id":"custom-boxes","name":"自定义三维装箱","industry":"logistics","kind":"box","unit":"mm","source":{"kind":"user","label":"用户参数建模"},"items":[{"id":0,"name":"箱体 A","width":400,"height":300,"depth":200,"quantity":12,"profit":3}],"stock":{"width":1200,"height":1000,"depth":1000,"copies":10},"settings":{"engine":"box","objective":"bins","rotation":"orthogonal","spacing":0,"edge":0,"kerf":0,"time_limit":10},"defects":[]}
```

- Axis mapping is **x=width, y=height, z=depth**. The interface labels them 长 X、宽 Y、高 Z; Z is displayed vertically. All dimensions are positive integers. Geometry consists of solid cuboids, not 2D polygons or arbitrary CAD meshes.
- `engine="box"` invokes real `packingsolver.box`. Objective `bins` packs all demand into as few equal containers as possible; `knapsack` selects valuable items in one container.
- Rotation `none` permits only XYZ; `orthogonal` permits XYZ, XZY, YXZ, YZX, ZXY and ZYX. Optional per-item `allowed_rotations` is a list of these strings. It further restricts the global set by intersection; an empty intersection is rejected. Numeric 2D angles and continuous 3D rotations are rejected.
- Box spacing/edge/kerf must be zero and defects must be empty. Noncuboid geometry, holes, mirrors and unimplemented stacking constraints are explicitly rejected. Optional `stock.maximum_weight` (alias `weight_capacity`) limits total payload per container; when set, every item must supply a strictly positive `weight` in one consistent unit. Result weights are independently recomputed from the input. Total payload feasibility does not establish local stacking strength, gravity stability, balance or a loading sequence.

## Eleven implemented engine routes

| Engine ID | Kinds | Objectives | Implemented constraints |
|---|---|---|---|
| irregular | irregular, rectangle | strip, bins, knapsack | Discrete/continuous rotations, spacing, edge margin, rectangular defects |
| rectangle | rectangle | strip, bins, knapsack | Integer sizes, axis-aligned directions, rectangular defects; zero spacing/edge/kerf |
| guillotine | rectangle | bins, knapsack | Integer sizes, Exact cuts with at most three stages, horizontal/vertical first cut, real kerf, rectangular defects; zero additional spacing/edge |
| onedimensional | onedimensional | bins, knapsack | Integer lengths; nonzero kerf is rejected |
| onedimensional-kerf | onedimensional | bins | Native length transformation `length + kerf`, unchanged capacity; every piece including the last reserves a tail cut |
| ffd-1d | onedimensional | bins | First-fit decreasing, same per-piece tail-kerf model; no defects, spacing or edge margin |
| bfd-1d | onedimensional | bins | Best-fit decreasing, same per-piece tail-kerf model; no defects, spacing or edge margin |
| shelf | irregular, rectangle | strip, bins | Local bounding-box greedy baseline, finite directions, spacing, edge margin; no defects/kerf |
| rectpack-maxrects | rectangle | bins | Native: rectpack 0.2.2; browser: its JavaScript MaxRectsBssf rule port; integer sizes, consistent rotation permission across types; no spacing/edge/kerf/defects |
| rectpack-skyline | rectangle | bins | Native: rectpack 0.2.2; browser: its JavaScript SkylineBl rule port; same input limits as MaxRects |
| box | box | bins, knapsack | Real PackingSolver 3D cuboids, fixed or six axis-permutation directions, per-item restrictions |

Guillotine cuts may pass through defects; finished parts must avoid them. Displayed cut lines come from the real cut-tree certificate. Unsupported combinations must produce explicit errors, not silently relaxed constraints.

Limits: 1–60 types; at most 500 total pieces; 3–200 vertices per 2D polygon; time budget 1–60 seconds; stock copies 1–100. Numeric inputs must be finite and satisfy route-specific bounds. Box dimensions are at most 1,000,000 coordinate units; aggregate volume is bounded below 2^62 in the native engine. The browser rejects aggregate stock or item volume above Number.MAX_SAFE_INTEGER (2^53−1), with exact BigInt checks before conversion, to preserve JavaScript integer precision.

## HTTP API

- `GET /api/health` → native `{ok:true,version:"0.1",engine_version:"0.1.1184"}`; browser additionally reports `runtime:"browser-local"`, `cross_origin_isolated`, capabilities and storage status. Browser engine_version identifies the pinned WASM commit, not the installed Python package.
- `GET /api/catalog` → `{datasets:[...],box_datasets:[{id,name,description}],industries:[...],engines:[...]}`. Datasets and engines describe the 1D/2D workspace; the separate 3D workspace uses box_datasets and the fixed box route.
- `GET /api/datasets/<id>` → Problem, including box-mixed, box-value and box-weight.
- `POST /api/jobs` with `{problem:Problem}` → `{id,status:"queued"}`, HTTP 202. All dimensions use this shared API and queue.
- `GET /api/jobs` → newest-first jobs; summaries may omit the full problem/result.
- `GET /api/jobs/<id>` → full Job.
- `POST /api/jobs/<id>/cancel` → Job.
- Errors use `{error:"human-readable message"}` and an appropriate HTTP error status.

Job contains id, name, created_at, status, elapsed_s and optional error, problem, submitted_problem, result. Status is queued/running/completed/failed/cancelled. One isolated solver worker runs at a time; inputs and outputs are persisted and tasks can be cancelled. Browser `phase=initializing` and `initialization_elapsed_s` distinguish cold loading from actual solving; `elapsed_s` starts when the engine starts. Browser-only `GET /api/jobs/<id>/events?after=<sequence>` returns retained real events, and `/api/jobs/<id>/snapshots/<sequence>` returns a stored independently checked layout when available.

Detailed jobs may include `progress`: `source`, `state`, `sequence`, `events[]`, `latest`, `latest_sequence`, `preview_sequence`, `preview_result`, `preview_validation`, `errors[]`, and `dropped_events`. Events come from actual native new-solution callbacks, WASM Session callbacks, or actual JS constructive states; they are not synthetic completion percentages. Each event may contain elapsed_s, placed_pieces, required_pieces, objective_value and bound_value. A missing bound remains null. Incomplete bins/strip candidates do not receive a fabricated full-demand objective value. `preview_sequence` is the layout's sequence; later bound-only events need not change the displayed layout.

Native detail responses preserve `latest_raw_certificate` and recording errors; browser enhancement converts and validates that certificate independently. Native provenance remains native. Cancellation keeps `status="cancelled"`; valid received candidates remain in `best_result` or progress.preview_result. A stop before any candidate does not create an empty successful result. Reloaded browser jobs that were queued/running become cancelled, with prior snapshots retained; closing a native UI tab does not itself stop the Python service job. Static and native histories are independent, and browser history is specific to origin, profile and storage state.

Submission uses JSON `{problem}` and a 2 MB body limit, at most 10 pending tasks. The native HTTP server requires `Content-Type: application/json`; callers should set that header for both modes. Browser routing retains ordinary Response semantics and leaves non-API or cross-origin requests to the original fetch.

## Engine interfaces and results

- `engine.normalize_problem(problem)` validates and canonicalizes without network access.
- `engine.solve(problem,output_dir)` runs one solve, writes artifacts to its assigned directory and returns Result. Box dispatches to `engine_box.solve_box`.
- `engine.validate_result(problem,result)` independently checks geometry. The native 1D/2D branch uses Shapely; native 3D checks interval bounds, cuboid overlap and axis permutations directly. The browser uses independent `CuttingGeometry.normalize/validate/validateTree` with pinned polygon-clipping and robust-predicates plus an independent triangulation fallback. It does not trust solver feasibility, totals or a pre-existing validation flag.

Common Result fields: engine, objective, elapsed_s, full, feasible, units, metrics, bins, validation, warnings, solver_statistics, engine_version, config.

1D/2D result:

```text
metrics = {required_pieces, placed_pieces, bin_count, used_length,
           utilization_percent, total_item_area, profit}
bins = [{index,width,height,
         items:[{id,name,angle,mirror:false,polygon:[[x,y],...]}],
         defects:[{x,y,width,height}],
         cuts?:[{x1,y1,x2,y2,stage}]}]
```

For 1D, display polygons use actual length x and height 1; utilization is length-based. Kerf routes additionally report total_item_length, kerf_loss_length, occupied_length, total_stock_length and unused_length. Their cuts contain item_index, item_id, model="per-piece-tail-kerf", start, end and width; the final piece also reserves its tail kerf. Fixed-sheet utilization divides by all used sheet area; strip utilization divides by fixed width × consumed length. Used_length is null for fixed stocks. Independent checks cover source shape, quantity, directions, bounds, overlap and applicable spacing/defects. Guillotine output additionally checks cut-tree topology, stages and kerf.

3D result:

```text
kind = "box"
metrics = {required_pieces, placed_pieces, bin_count, utilization_percent,
           total_item_volume, total_stock_volume, total_item_weight, profit}
bins = [{index,width,height,depth,total_weight,maximum_weight,
         items:[{id,name,x,y,z,width,height,depth,weight,rotation:"XYZ"}]}]
```

Three-dimensional results have **no 2D polygon proxy**. Total_stock_volume is the volume of used containers. Utilization divides placed item volume by that volume. Validation checks quantity, container bounds, absence of positive-volume overlap, permitted axis permutations, original dimensions, and per-container payload recomputed from original item weights.

Validation includes pass, geometry_pass, full_demand and errors. A knapsack solution may legitimately be feasible with full=false; other partial solutions must not be described as fulfilling the order. Numerical checks are not exact-arithmetic or global-optimum proofs.

## Frontend integration

Static frontend: index.html, styles.css, app.js, editor-2d.js/css, workspace-3d.js/css and viewer-3d.js/css. Three.js 0.180.0 and OrbitControls are served from local static/vendor; no remote CDN or fonts are required.

### 2D drawing

- “新建自绘场景” creates a millimetre-based irregular scene; “＋ 自定义画图” adds to the current 2D scenario. A 1D scenario rejects polygon insertion.
- `window.CuttingDrawEditor.open({initialPoints?,name?,quantity?,onSave})` returns `{dialog,result,close,getPoints}`. Callback: `onSave(points,name,quantity)`. The result Promise resolves to saved values or null on cancellation. `CuttingDrawEditor.validate(points)` returns basic polygon validity, area and dimensions.
- Features: point placement, closure, vertex dragging, numeric coordinates, rectangle generation, grid snapping, vertex insertion/deletion, undo/redo, zoom and pan. The editor checks zero area, coincident adjacent vertices and self-intersection; the execution runtime independently validates the submitted problem and resulting certificate.
- `CuttingLab.addPolygon(points,name,quantity)` inserts without rescaling. Adding to a rectangle scene converts its items to polygons, switches to irregular and resets unsupported kerf to zero. Users must review the resulting settings. New polygons default to 0°/180° permission.
- `CuttingLab.setProblem,getProblem,showTab,refreshHistory,notifyProblemChanged` connect the editor to the main workspace.

### 3D parameter models and results

- “三维建模与装箱” is a separate workspace. Users edit container/item dimensions, quantity, value and directions, then submit real jobs. Its table offers “允许换向” or “保持原向”; the engine also accepts specific axis-permutation lists.
- `Cutting3DViewer.mount(container,{stock,items,units?,onSelect?})` shows model previews: one specimen of each type outside the container. These display positions are not a packing plan.
- `Cutting3DViewer.renderResult(container,result,{binIndex?,onSelect?})` renders one solved container. The controller provides resetView, resize, setWireframe, setTransparent, select and destroy. Left-drag rotates the camera, wheel zooms, right-drag pans; picking reports dimensions, position and direction. Top/front views, wireframe and transparency aid inspection. Camera rotation does not change solver orientation.
- `window.CuttingBox={openJob,show,getProblem}` connects 3D jobs to common history. Three-dimensional jobs reopen in their workspace and are excluded from the 2D comparison table.
- Model preview and solved layout remain distinct. Modified parameters mark old results stale until recalculation. Users can switch containers, cancel tasks, reopen history, export `{problem,last_result}` JSON and save a PNG view. This export is an archival bundle, not a general CAD interchange format.
- WebGL failures are explicit; no fabricated successful render is substituted. Supported editing is polygon outlines and parameterized cuboids, not arbitrary CAD surfaces/solids or physical stability simulation.

## Distributed inputs and provenance

The repository distributes five normalized ESICUP XML-derived benchmark inputs and ten explicitly synthetic catalog scenarios. It does not include the historical raw XML/PDF/TXT downloads, OR-Datasets comparison files, private orders or saved user jobs. `source.sha256` identifies the upstream XML bytes; it is not the hash of the normalized JSON or browser-data.json. Those distributed-file hashes are recorded separately in `data/distribution_source_audit.json`. See `data/DISTRIBUTION_SOURCE_AUDIT.md` for the conversion and retained constraints. SWIM uses the XML integer-coordinate variant; physical units remain unknown for all five benchmarks.
