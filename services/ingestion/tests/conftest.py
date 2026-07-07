import os
import sys

# Make the ingestion modules importable (services use bare `from frame import ...`).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
