# Phase 11: DevOps & Production Operations Manual

This document provides installation, configuration, deployment, and operational procedures for the VandeInspect AI platform.

---

## 1. Prerequisites and System Requirements

### 1.1 Edge Inspection Nodes (Wayside Station)
* **OS**: Windows 10/11 Enterprise LTSC or Ubuntu 20.04/22.04 LTS.
* **CPU**: Intel Xeon or Core i7 (6+ Cores, 3.5 GHz base).
* **GPU**: NVIDIA RTX 3080 / RTX 4080 (or workstation equivalent with 16 GB+ VRAM).
* **Memory**: 32 GB DDR4/DDR5.
* **Storage**: 1 TB NVMe SSD (minimum write speed 3000 MB/s to handle raw GigE frame extraction).
* **CUDA Toolkits**: CUDA 11.8 or 12.1, cuDNN v8.9.x.

### 1.2 Central Cloud Server (Management Dashboard)
* **Databases**: Neon Serverless PostgreSQL instance (v15+).
* **Storage**: Cloudinary account for media hosting.

---

## 2. Environment Variables Configuration

The platform requires configuration across the Gateway and Python microservices.

### 2.1 Backend Gateway (`backend/.env`)
```ini
PORT=8001
NODE_ENV=production
FRONTEND_URL=http://localhost:5173
DATABASE_URL="postgresql://user:pass@ep-host.region.pooler.neon.tech/vandeinspect?sslmode=require"
CLOUDINARY_CLOUD_NAME=d...
CLOUDINARY_API_KEY=1...
CLOUDINARY_API_SECRET=e...
```

### 2.2 OCR Microservice (`GPU/ocr/.env`)
```ini
DATABASE_URL="postgresql://user:pass@ep-host.region.pooler.neon.tech/vandeinspect?sslmode=require"
YOLO_SERVICE_URL="http://127.0.0.1:5002/api/yolo/predict_train_number"
OCR_DEVICE=gpu
KMP_DUPLICATE_LIB_OK=TRUE
```

### 2.3 YOLO Microservice (`GPU/yolo/.env`)
```ini
PORT=5002
YOLO_DEVICE=cuda
```

---

## 3. Installation and Deployment Steps

Follow this execution sequence to deploy the VandeInspect suite:

```mermaid
graph TD
    A[Install System CUDA & cuDNN] --> B[Clone Repository]
    B --> C[Backend Gateway Setup]
    B --> D[Python Microservices Setup]
    
    C --> C1[npm install]
    C1 --> C2[npx prisma db push]
    
    D --> D1[Setup OCR VirtualEnv]
    D --> D2[Setup YOLO VirtualEnv]
    
    C2 --> E[Launch Gateway Server]
    D1 --> F[Launch OCR Worker]
    D2 --> G[Launch YOLO Worker]
```

### Step 1: Database Migration
Verify your PostgreSQL database connection in the Gateway environment, then push the database schema using Prisma:
```bash
cd backend
npm install
npx prisma db push
```

### Step 2: Set Up Python Microservices
Create virtual environments and install dependencies for the isolated Python workers:

#### OCR Service Setup
```bash
cd GPU/ocr
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux:
source venv/bin/activate
pip install -r requirements.txt
# Ensure CUDA support is configured
pip install nvidia-cudnn-cu12==8.9.7.29
```

#### YOLO Service Setup
```bash
cd ../yolo
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux:
source venv/bin/activate
pip install -r requirements.txt
```

---

## 4. Run Procedures (Startup Sequences)

To ensure proper startup synchronization, launch services in the following order.

### 1. Launch the YOLO Service
The YOLO service processes requests from both the OCR crop worker and the defect detection pipeline.
```bash
cd GPU/yolo
venv\Scripts\activate
python server.py
```
*Verify: Command output should confirm: `Running on http://127.0.0.1:5002`.*

### 2. Launch the OCR Service
```bash
cd GPU/ocr
venv\Scripts\activate
python server.py
```
*Verify: Console output should log the CUDA device: `PaddleOCR initialized on gpu`.*

### 3. Start the Backend API Gateway
```bash
cd backend
npm start
```

### 4. Start the Frontend Application
```bash
cd frontend
npm install
npm run dev
```

---

## 5. Operations & Monitoring

### 5.1 System Health Checks
Use the gateway's health endpoint to verify database connectivity:
```bash
curl http://localhost:8001/api/health
```
**Expected Response**:
```json
{
  "status": "healthy",
  "database": "connected"
}
```

### 5.2 Log Analysis
All backend logs are saved in JSON format using Pino, allowing you to search for pipeline errors:
```bash
tail -f backend/logs/app.log | grep -E "(error|fail)"
```
