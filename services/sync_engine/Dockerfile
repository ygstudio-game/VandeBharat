FROM python:3.10-slim

WORKDIR /app

COPY services/sync_engine/requirements.txt services/sync_engine/requirements.txt
RUN pip install --no-cache-dir -r services/sync_engine/requirements.txt

COPY GPU/shared/ GPU/shared/
COPY services/sync_engine/ services/sync_engine/

WORKDIR /app/services/sync_engine

EXPOSE 5004
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5004"]
