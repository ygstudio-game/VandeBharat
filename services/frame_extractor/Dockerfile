FROM python:3.10-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/frame_extractor/requirements.txt services/frame_extractor/requirements.txt
RUN pip install --no-cache-dir -r services/frame_extractor/requirements.txt

COPY GPU/shared/ GPU/shared/
COPY services/frame_extractor/ services/frame_extractor/

WORKDIR /app/services/frame_extractor

EXPOSE 5003
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5003"]
