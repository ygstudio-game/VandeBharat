import sys
import os

# Allow `from core.x import ...` and `from ingestion.x import ...`
# when pytest is run from the frameinput/ directory.
sys.path.insert(0, os.path.dirname(__file__))


def pytest_configure(config):
    config.addinivalue_line(
        "markers",
        "integration: requires a running PostgreSQL instance (skipped by default)",
    )
