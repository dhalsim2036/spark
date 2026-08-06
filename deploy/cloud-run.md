# Deploy Spark on Google Cloud

Spark is deployed as one Cloud Run service: Express serves the compiled React app and Socket.IO from the same public domain.

## One-time Google Cloud setup

Replace `PROJECT_ID` with your Google Cloud project ID and choose a region close to your users (the examples use `asia-east1`).

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com
gcloud artifacts repositories create spark --repository-format=docker --location=asia-east1
```

Create Cloud SQL Postgres and the `spark` database through the Google Cloud Console. Create a dedicated database user and keep its password in Secret Manager. The runtime connection URL should use the Cloud SQL Unix socket:

```text
postgresql://USER:PASSWORD@localhost/spark?host=/cloudsql/PROJECT_ID:asia-east1:INSTANCE_NAME
```

Store that full URL as a Secret Manager secret named `spark-database-url`.

## Deploy

```bash
gcloud run deploy spark \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 1 \
  --session-affinity \
  --add-cloudsql-instances PROJECT_ID:asia-east1:INSTANCE_NAME \
  --set-secrets DATABASE_URL=spark-database-url:latest
```

Cloud Run builds the included Dockerfile through Cloud Build. The command prints Spark's public URL when the deployment completes.

## Before scaling beyond one instance

Cloud Run instances do not share in-memory Socket.IO state. Add Redis/Memorystore, the Socket.IO Redis adapter, and Redis-backed temporary session/chat state before increasing `--max-instances`. WebSocket connections must also reconnect after Cloud Run's maximum 60-minute request timeout.
