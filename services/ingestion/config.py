"""
Ingestion config (B1) — loaded from root config.yaml `ingestion:` block with env
overrides. No hardcoded values in the hot path (carry-forward of competitor rule #8).
"""
import os

_DEFAULTS = {
    "source_uri": "sample.mp4",   # looping file source (B1 default)
    "camera_id": 0,
    "fps": 25,
    "buffer_capacity": 200,
    "jpeg_quality": 85,
    "frame_store_dir": "uploads/ingest",
    "redis_url": "redis://127.0.0.1:6379",
    "max_reconnect_attempts": 5,
    "backoff_base_s": 0.5,
}


def load_config() -> dict:
    cfg = dict(_DEFAULTS)
    # root config.yaml (optional)
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    yaml_path = os.path.join(root, "config.yaml")
    if os.path.exists(yaml_path):
        try:
            import yaml
            with open(yaml_path) as f:
                data = yaml.safe_load(f) or {}
            cfg.update(data.get("ingestion", {}) or {})
            cfg["quality"] = data.get("quality", {}) or {}
            cfg["scheduler"] = data.get("scheduler", {}) or {}
        except Exception:
            pass
    cfg.setdefault("quality", {})
    cfg.setdefault("scheduler", {})
    # env overrides (INGEST_*)
    for k in cfg:
        env = os.environ.get("INGEST_" + k.upper())
        if env is not None:
            cur = cfg[k]
            cfg[k] = type(cur)(env) if isinstance(cur, (int, float)) else env
    return cfg
