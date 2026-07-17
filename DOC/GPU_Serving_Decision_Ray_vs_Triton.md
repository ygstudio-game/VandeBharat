# GPU Serving & Orchestration — Ray vs Triton Decision Summary

**Purpose:** capture the reasoning behind evaluating Ray for the Railway AI
Inspection System's compute substrate, why it was tested via a working PoC,
and why the final v1 recommendation is **Triton Inference Server for GPU
model-serving + keep the existing threading orchestrator** (Ray not adopted
for v1). Shared for team research/discussion before any implementation
commitment.

**Companion docs:** `Railway_AI_Inspection_System_ADS.md` (updated per this
decision), `orchestrator/docs/ray_migration_plan.md` (full migration design,
kept for reference/v2), `orchestrator/ray_poc/` (working Ray PoC — proves the
actor/task pattern runs against real footage, ~200 lines, isolated from the
production orchestrator).

---

## 1. What Ray is (plain language)

Ray is a Python library for running code across many CPUs/GPUs without
hand-writing multiprocessing/locks. Two core primitives:

- **Task** — stateless function call (`@ray.remote def f(): ...`). Ray picks
  any free worker, runs it, forgets it. Good for pure functions with no
  memory needed between calls (e.g. resize a frame).
- **Actor** — stateful object (`@ray.remote class C: ...`). Lives in one
  dedicated process, keeps state between method calls. `num_gpus=1` on an
  actor means Ray's scheduler guarantees **only that actor** ever touches
  that GPU — automatic mutual exclusion, no hand-written lock/arbiter needed.

**Analogy:** your GPU is one cashier. Without Ray, every model "shouts its
order" whenever it wants (today's HTTP-service-with-timeout-pool pattern) —
no real line, no priority. Ray/Triton both impose an orderly queue; the
difference is *what* imposes it.

Dashboard (`localhost:8265` when running Ray) shows live actor list, task
timeline, resource usage — useful for demoing/debugging but not required for
production.

## 2. What we proved with the Ray PoC

Built `orchestrator/ray_poc/` — a standalone, isolated PoC (does not touch
the working orchestrator). Confirmed working against **real footage**
(Cam1.mp4, Cam2.mp4, OCR.mp4):

- 1 `GpuWorkerActor` (`num_gpus=1`) processed 12 real frames sequentially
  (actor lifetime count 1→12) — proved Ray's exclusive-GPU-ownership claim
  is real, not just documentation
- CPU preprocessing ran as parallel Ray tasks ahead of the GPU actor
- Real YOLO detections returned (reused existing `services/yolo_client.py`,
  no model code duplicated)
- Added annotated-frame output (reused `services/annotation.py`'s
  `draw_detections()`) — same "only save frames with a hit" rule as the
  production `StorageManager`

**Real bug found & fixed along the way:** Ray workers run in separate OS
processes and don't inherit the driver's `sys.path` — had to pass
`runtime_env={"env_vars": {"PYTHONPATH": ...}}` to `ray.init()` so the actor
could import `services.yolo_client`. Documented in the PoC README.

**Environment note:** Ray has no wheels for Python 3.14 (this machine's
default). Required installing a separate Python 3.12 + venv (`.venv-ray/`)
side-by-side — no impact on the main orchestrator's Python version.

## 3. Why Ray was initially "not yet justified" (3-camera scale)

At the original 3-camera Phase-1 scope (1 OCR-cam + Cam1 + Cam2), GPU
contention between OCR calls and Detection calls was rare — the two rarely
fired simultaneously. Ray's core value (GPU mutual exclusion) had nothing
real to arbitrate. Verdict at that scale: **Ray adds real operational
overhead (separate Python version, cluster process, dashboard, serialization
cost) for a problem that mostly wasn't happening yet.** Recommendation was to
keep the existing threading orchestrator.

## 4. The real 12-camera / Nvidia Spark scenario — why Ray became worth discussing

Actual production scenario clarified via interview:
- **1 physical GPU** (Nvidia Spark edge device, unified memory, still one
  compute die)
- **12 camera feeds**: Cam12 → OCR pipeline (gap detection + OCR/train
  number); Cam1-4, Cam5-7, Cam8-11 → three separate pipelines, 3 models each
  (~9 models) + 2 OCR-pipeline models = **~11 models total**
- **True real-time** — all pipelines must keep pace as the train physically
  passes; frames pile up otherwise
- **Single edge device only** — no near-term multi-site/multi-node plan
- **All models same framework** (YOLO/torch family)
- **MinIO** used as the frame/result storage layer, later synced to cloud

This is genuine, guaranteed GPU contention every train pass — not
theoretical. 11 models on 1 GPU, real-time, with **zero real arbitration
today** (current HTTP-service-with-timeout-pool just serves whoever's
request lands first). This is where Ray's actor exclusivity + priority
pattern becomes a real fit — not because "Ray is the future," but because
this specific scenario has the concrete contention Ray's design targets.

**Design flag raised:** if MinIO sits in the *real-time hot path* (write
frame → MinIO → pipeline reads it back → detect → write again), that's two
extra network+disk round-trips per frame on top of GPU inference — a real
latency risk. Recommendation: keep MinIO as the **durability/cloud-sync
layer only**; route the hot preprocessing→pipeline frame handoff through an
in-memory mechanism (Ray's object store, if Ray is adopted; otherwise
in-process queues as today).

## 5. Better fit found: NVIDIA Triton Inference Server

Ray is a **general-purpose distributed compute framework** — GPU arbitration
is one thing it *can* do, not what it was built for. **Triton Inference
Server** (NVIDIA) is *purpose-built* for exactly this problem: serving many
models on one GPU, in real time, efficiently.

| | Ray | Triton |
|---|---|---|
| What it is | general Python distributed compute | purpose-built GPU model-serving server |
| Dynamic batching | hand-write it | **built-in** — auto-batches frames across your 3 pipeline groups into fewer, bigger GPU calls |
| Priority between models | hand-write a Priority-Policy Actor | **built-in** `priority_levels` per model in config |
| Concurrent models on 1 GPU | via actors, you manage it | **native** `instance_group` config — exactly this use case |
| Framework support | anything (Python) | native **TensorRT, ONNX, PyTorch** — matches "all same framework" + NVIDIA hardware |
| Vendor | Ray project (open source) | **NVIDIA** — same vendor as the Spark device |
| Handles business logic (camera capture, events, stitching)? | Can, if you build it | **No** — pure model server, zero opinion on pipeline logic |

**Recommended architecture:**
```
Triton Inference Server (own Docker container, owns the GPU)
  ├── model_repository/ (~11 models, each with config.pbtxt:
  │     dynamic_batching, priority_levels, instance_group)
  └── gRPC/HTTP API
         ▲
         │  services/triton_client.py (replaces yolo_client.py — same
         │  method shapes, minimal change to OCRManager/DetectionManager)
         │
Orchestrator (existing threading — Cam capture, Preprocessing, Gap
Detection, EventManager, FrameAssignment, Stitch, Storage — all unchanged)
```

**Code impact:** `services/yolo_client.py` → `services/triton_client.py`
(swap `requests.post` for `tritonclient.grpc`, same method signatures) — no
change needed in any manager that calls it. `GPU/yolo/server.py`'s FastAPI
wrapper retired, replaced by Triton's built-in server + one `config.pbtxt`
per model. Existing `.pt` weights run via Triton's PyTorch/LibTorch backend
directly — TensorRT conversion is an optional, separate later optimization
for latency, not a blocker.

## 6. Why NOT add Ray on top of Triton

Once Triton owns GPU arbitration, Ray's strongest justification for this
project (GPU mutual exclusion + priority) is already solved. What Ray would
still offer — per-camera-group fault isolation (`max_restarts`), a second
dashboard, actor-based state cleanliness — is real but secondary, and comes
at the cost of operating *two* new pieces of infrastructure instead of one.
**Recommendation: Triton alone + keep the existing, already-verified
threading orchestrator.** Reconsider Ray/KubeRay together only if/when a
genuine multi-site/multi-node rollout becomes concrete (it is currently
unclear/far-future per the team).

## 7. Docker & Kubernetes — where they fit

Not a 3-way competition with Ray — different layers:

| Layer | Tool | Solves |
|---|---|---|
| Packaging | **Docker** | reproducible runtime (same CUDA/cuDNN/Python everywhere) — directly prevents the PATH/driver-mismatch class of bug hit during this project's GPU-OCR setup |
| Multi-node orchestration | **Kubernetes** | run N containers reliably across M machines — **not needed yet**, single edge device |
| Distributed compute inside the app | **Ray** | GPU-aware task/actor scheduling — superseded by Triton for the model-serving piece specifically |

**Recommendation: Docker yes (independent of everything else — pure
packaging win). Kubernetes no, until multi-site is real.**

## 8. Final recommendation (ranked)

1. **Best for this project now:** Triton Inference Server for the ~11-model
   GPU serving layer + keep the existing threading orchestrator unchanged.
   Smallest, lowest-risk change (swap one client module, add per-model
   config files) — does not touch the already-verified-on-real-footage
   pipeline logic (gap detection, event lifecycle, stitching, storage
   rename-on-resolve).
2. **If multi-site/multi-node becomes concrete later:** revisit Ray (or
   KubeRay for the multi-node case) — the migration plan is already written
   and kept for reference (`orchestrator/docs/ray_migration_plan.md`).
3. **Not recommended now:** hand-rolling a custom priority/batching layer on
   top of the current HTTP+threading setup — reinvents what Triton already
   does natively.

## 9. Open items for team research

- [ ] Confirm exact Nvidia Spark GPU VRAM capacity vs combined footprint of
      ~11 models (affects Strategy A/B/C residency choice — see ADS §11.5)
- [ ] Prototype Triton `config.pbtxt` for one model end-to-end (dynamic
      batching + priority) against real footage, same rigor as the Ray PoC
- [ ] Decide MinIO's role precisely: durability/cloud-sync only, vs. any
      part of the real-time hot path — must be resolved before latency
      budgets are trusted
- [ ] Evaluate TensorRT conversion timeline for the ~11 models (separate,
      optional latency optimization, not a blocker to start with Triton)
