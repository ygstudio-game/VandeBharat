# Phase 9: Architectural Decision Records (ADRs)

This section compiles the Architectural Decision Records (ADRs) that guided the design, development, and pivot points of the VandeInspect AI platform.

---

## ADR-001: Pivot from Express.js to Fastify for the API Gateway

### Context
The gateway API must handle concurrent video uploads, parse multi-part form data, stream frames, manage WebSocket clients, and coordinate microservice requests. Early benchmarks with Express.js showed high routing overhead, slower JSON serialization under load, and callback complexity when handling stream pipelines.

### Decision
Fastify was selected for the API gateway.
1. **Low Overhead**: Fastify scales to $10,000+$ requests/sec with minimal CPU utilization.
2. **Schema Compilation**: Fastify uses compiled JSON schemas for input validation and output serialization, reducing CPU overhead during API response generation.
3. **Structured Logging**: Built-in integration with the Pino logger provides structured JSON logs, facilitating log parsing in production.
4. **Plugin Ecosystem**: Native plugins for CORS, multipart forms (`@fastify/multipart`), and WebSockets (`@fastify/websocket`) provide a unified, highly optimized middleware stack.

---

## ADR-002: Pivot from RabbitMQ to Direct HTTP Loopback Orchestration

### Context
The initial design proposed using a RabbitMQ message broker to distribute frames to YOLO and OCR workers. While robust, this architecture introduced significant complexity:
* Setting up and maintaining a local RabbitMQ instance on edge inspection PCs.
* Serialization overhead from packaging binary frames into AMQP message payloads.
* Increased troubleshooting complexity for on-site operators.

### Decision
Microservice orchestration was simplified to use **direct HTTP loopback requests** over localhost, with concurrency managed by the Fastify gateway.
1. **Sliding-Window Concurrency**: The Fastify orchestrator limits requests to `OCR_CONCURRENCY = 4` using standard promise pools (`Promise.allSettled`).
2. **Direct Worker DB Writes**: Workers write OCR results and defect coordinates directly to the Neon PostgreSQL database using SQLAlchemy/psycopg2, bypassing Node.js gateway serialization overhead.
3. **Lower System Overhead**: Eliminating the message broker simplifies setup on Edge machines and reduces runtime memory usage.

---

## ADR-003: CUDA Runtime DLL Path Injection (Process Isolation)

### Context
Running YOLO (PyTorch) and PaddleOCR (PaddlePaddle) within a single Python process on Windows hosts caused immediate crashes:
```
Exit code: 0xC0000005 (Access Violation)
```
This was caused by conflicting CUDA runtimes: PyTorch requires cuDNN 9.x, while PaddlePaddle requires cuDNN 8.x DLLs (`cudnn_ops_infer64_8.dll`). Attempting to load both into a single process's memory space caused memory corruption.

### Decision
1. **Process Isolation**: The YOLO service and the OCR service run in separate OS processes on distinct localhost ports (`5002` and `5000`).
2. **Dynamic DLL Injection**: At startup, the OCR service checks if it is running on Windows and dynamically injects the cuDNN 8.x bin path into the system's DLL lookup directory before initializing PaddleOCR:

```python
if sys.platform == "win32":
    _extra_dll_paths = []
    for pkg in ("nvidia.cudnn", "nvidia.cublas", "nvidia.cuda_runtime", "nvidia.cusparse"):
        try:
            mod = __import__(pkg, fromlist=["__file__"])
            pkg_bin = os.path.abspath(os.path.join(os.path.dirname(mod.__file__), "bin"))
            if os.path.exists(pkg_bin):
                os.add_dll_directory(pkg_bin)
                _extra_dll_paths.append(pkg_bin)
        except Exception:
            pass
    if _extra_dll_paths:
        os.environ["PATH"] = ";".join(_extra_dll_paths) + ";" + os.environ.get("PATH", "")
```

---

## ADR-004: Pivot from CPU Timestamps to Unified trigger_id

### Context
Aligning video feeds using CPU system clocks (timestamps) proved unreliable. Network jitter, variable video encoding frame rates, camera driver delays, and changes in train speed introduced alignment errors of up to 500ms. At a velocity of 60 km/h, a 500ms delay shifts the calculated position of a defect by **8.3 meters**, resulting in defects being mapped to the wrong coaches.

### Decision
The system was pivoted to use a unified physical coordinate system: **`trigger_id`**.
1. **Production Mode**: A physical wheel sensor generates electrical trigger pulses that trigger all camera shutters simultaneously. The pulse count serves as the unified `trigger_id`.
2. **Test Mode**: Frame extraction uses the raw video frame index:
   $$\text{trigger\_id} = \text{frame\_number}$$
3. **Accuracy**: Physical synchronization ensures frame alignment is independent of train speed, frame drops, or network latency, guaranteeing sub-centimeter accuracy for defect mapping.

---

## ADR-005: Dual-Pass OCR Pipeline with Preprocessing

### Context
Single-pass OCR on cropped images yielded poor results on dirty, faded, or motion-blurred coach numbers. However, applying intensive image preprocessing to every frame significantly increased pipeline processing time.

### Decision
Implement a **dual-pass OCR pipeline** to balance accuracy and processing speed:
1. **Pass 1 (Fast)**: Run PaddleOCR directly on the raw BGR crop. If a valid 5-6 digit coach number is detected, return the result immediately.
2. **Pass 2 (Enhanced Fallback)**: If Pass 1 fails, apply a preprocessing chain (grayscale, 2x upscale, sharpening, CLAHE, and Gaussian blur) to improve character contrast before running PaddleOCR again.
3. **Full-Frame Fallback**: If the crop fails to yield a result, run Pass 2 on the entire frame as a final fallback.
This approach preserves processing speed for clear frames while applying intensive enhancement steps only when needed.
