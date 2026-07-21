FROM python:3.10-slim

WORKDIR /app

COPY services/ingestion/requirements.txt services/ingestion/requirements.txt
RUN pip install --no-cache-dir -r services/ingestion/requirements.txt

COPY GPU/shared/ GPU/shared/
COPY config.yaml .
COPY services/ingestion/ services/ingestion/

WORKDIR /app/services/ingestion

EXPOSE 5007
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5007"]
