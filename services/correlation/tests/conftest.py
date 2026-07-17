import os
import sys

# Make correlation modules importable (service uses bare `from engine import ...`).
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
