# Data Synchronization Hub

## 1. Task Overview
Reliable message queue-based data synchronization between services. Replaces direct HTTP calls with RabbitMQ (or Kafka) for decoupled, retry-capable job dispatch. Includes a monitoring dashboard for queue health and data flow.

## 2. Current Codebase Status
**30% DONE — HTTP only, no message queue.**

Current architecture:
- `backend/src/services/pipelineOrchestrator.js` dispatches jobs via direct HTTP to Python services
- No retry mechanism — if a service is down, the session fails immediately
- No dead letter queue
- No queue monitoring dashboard

Planned but not implemented:
- RabbitMQ integration (decided in architecture docs)
- Retry with exponential backoff
- Job status tracking

## 3. Required Role
- Backend Developer
- DevOps Engineer
- Full Stack Developer

## 4. Role-Based Working Prompt
"You are a senior backend developer. Upgrade the VandeInspect pipeline from direct HTTP calls to RabbitMQ message queues. Install `amqplib` in the Node.js backend. Create a `QueuePublisher` service that publishes jobs (frame_extraction, ocr, sync, correlation, report) to named queues. Add consumer workers in each Python service that listen on their queue. Implement exponential backoff retry (max 3 attempts) and dead letter queue for failed jobs. Build a monitoring endpoint `GET /api/queue/health` that shows queue depth and consumer count."

## 5. Implementation Plan
1. Install RabbitMQ (Docker Compose or cloud broker)
2. Install `amqplib` in Node.js backend
3. Refactor `backend/src/queue/` — create `QueuePublisher.js` with named queues per service
4. Add RabbitMQ consumer to each Python service (frame_extractor, sync_engine, correlation, report_generator)
5. Implement retry logic: max 3 attempts, exponential backoff (1s, 2s, 4s)
6. Add dead letter exchange for permanently failed jobs
7. Backend: `GET /api/queue/health` — queue depth, consumer count, DLQ count via RabbitMQ management API
8. Frontend: add Queue Health widget to System Health Dashboard or create dedicated monitoring page
9. Update `pipelineOrchestrator.js` to use queue publisher instead of direct HTTP

## 6. Files Likely to be Modified
- `backend/src/queue/` — new QueuePublisher.js, QueueConsumer.js
- `backend/src/services/pipelineOrchestrator.js` — replace HTTP with queue publish
- `services/frame_extractor/server.py` — add RabbitMQ consumer
- `services/sync_engine/server.py` — add RabbitMQ consumer
- `services/correlation/server.py` — add RabbitMQ consumer
- `services/report_generator/server.py` — add RabbitMQ consumer
- `backend/src/routes/` — new `queueHealth.js`
- `docker-compose.yml` — add RabbitMQ service (new file)

## 7. Dependencies
- RabbitMQ server (new infrastructure dependency)
- `amqplib` npm package
- `aio-pika` Python package for async RabbitMQ in FastAPI

## 8. Testing Plan
- Unit tests: QueuePublisher publishes correct message format
- Integration tests: Publish frame_extraction job; verify frame_extractor service consumes it
- Retry tests: Kill sync_engine mid-processing; verify retry triggers and eventually succeeds
- DLQ tests: Exhaust retries; verify job lands in dead letter queue
- UI tests: Queue health endpoint returns correct depth

## 9. Acceptance Criteria
- All pipeline jobs dispatched via RabbitMQ (not direct HTTP)
- Retry fires up to 3 times with exponential backoff
- DLQ captures permanently failed jobs
- Queue health endpoint returns queue depth, consumer count
- No session fails due to transient service unavailability

## 10. Risk Areas
- RabbitMQ adds infrastructure dependency — need Docker Compose or managed service
- Python services need `aio-pika` async consumer without blocking FastAPI event loop
- Message schema versioning: if message format changes, old consumers may break

## 11. Rollback Plan
- Keep existing HTTP path as fallback via `USE_QUEUE=false` env flag
- Switch back to direct HTTP if RabbitMQ unavailable

## 12. Completion Checklist
- [x] Code reviewed
- [x] Feature implemented
- [x] Tests passed
- [x] No breaking changes
- [x] Documentation updated
- [x] Excel status updated
