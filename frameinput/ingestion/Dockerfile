FROM python:3.11-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps before copying source (layer-cache friendly)
COPY ingestion/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy source packages
COPY core/       ./core/
COPY ingestion/  ./ingestion/

ENV PYTHONPATH=/app

CMD ["python", "-m", "ingestion.pipeline"]
