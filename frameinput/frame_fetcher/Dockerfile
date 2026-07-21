FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY frame_fetcher/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# frame_fetcher/server.py imports ingestion.metrics for the retrieval_latency
# histogram — copy only the two files needed, not the full ingestion pipeline.
COPY core/                   ./core/
COPY ingestion/__init__.py   ./ingestion/__init__.py
COPY ingestion/metrics.py    ./ingestion/metrics.py
COPY frame_fetcher/          ./frame_fetcher/

ENV PYTHONPATH=/app

CMD ["uvicorn", "frame_fetcher.server:app", \
     "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--log-level", "info"]
