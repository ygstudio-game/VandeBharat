"""
Integration smoke test — hits each running service's /health over HTTP and asserts
the standardized envelope {service, status, version}.

Run only when services are up:
    pytest -m integration tests/integration/test_health_endpoints.py

Override base host with HEALTH_HOST env (default 127.0.0.1).
"""
import os
import pytest
import requests

HOST = os.environ.get("HEALTH_HOST", "127.0.0.1")

SERVICES = {
    "ingestion": 5007,
    "ocr": 5000,
    "yolo": 5002,
    "frame_extractor": 5003,
    "sync_engine": 5004,
    "correlation": 5005,
    "report_generator": 5006,
}

REQUIRED_KEYS = {"service", "status", "version"}


@pytest.mark.integration
@pytest.mark.parametrize("name,port", SERVICES.items())
def test_service_health(name, port):
    r = requests.get(f"http://{HOST}:{port}/health", timeout=5)
    assert r.status_code == 200, f"{name} /health returned {r.status_code}"
    body = r.json()
    assert REQUIRED_KEYS <= set(body.keys()), f"{name} missing keys: {body}"
    assert body["service"] == name
    assert body["status"] == "ok"
