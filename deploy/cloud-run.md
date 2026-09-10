# Deploy Spark on Google Cloud

Spark runs as one Cloud Run service. The Express server delivers the React app and Socket.IO from the same HTTPS domain. Firestore retains only anonymous session-expiry records and moderation reports; locations, profiles, requests, photos, and chat messages remain temporary server memory.

## One-time Google Cloud setup

Replace `PROJECT_ID` and choose a region close to your users (these examples use `asia-east1`).

```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com firestore.googleapis.com
gcloud artifacts repositories create spark --repository-format=docker --location=asia-east1
gcloud firestore databases create --location=asia-east1 --type=firestore-native
gcloud firestore fields ttls update expiresAt --collection-group=sessions --enable-ttl
```

Firestore TTL removes stale session metadata after expiry. It is asynchronous, so the server also deletes the session document immediately when a user disconnects.

Create a dedicated Cloud Run service account. It needs only Firestore document access:

```bash
gcloud iam service-accounts create spark-runtime --display-name="Spark runtime"
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:spark-runtime@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

For the included Cloud Build pipeline, grant the Cloud Build service account permission to deploy Cloud Run revisions and act as the runtime account:

```bash
PROJECT_NUMBER=$(gcloud projects describe PROJECT_ID --format='value(projectNumber)')
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/run.admin"
gcloud iam service-accounts add-iam-policy-binding spark-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## First deployment

```bash
gcloud run deploy spark \
  --source . \
  --region asia-east1 \
  --allow-unauthenticated \
  --service-account spark-runtime@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars FIRESTORE_PROJECT_ID=PROJECT_ID \
  --port 8080 \
  --memory 512Mi \
  --concurrency 80 \
  --timeout 3600 \
  --min-instances 1 \
  --max-instances 1 \
  --session-affinity
```

Cloud Run builds the included Dockerfile and prints the public URL. The runtime uses its service identity to authenticate to Firestore; do not create or upload a service-account key.

## Continuous deployment with Cloud Build

Connect the GitHub repository to a Cloud Build trigger and use `cloudbuild.yaml`. For a first build from Cloud Shell:

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions=_REGION=asia-east1,_SERVICE=spark
```

Before using the automated pipeline, edit the Cloud Run service once to assign `spark-runtime@PROJECT_ID.iam.gserviceaccount.com`. The pipeline then preserves that runtime identity while deploying new images.

## Important Socket.IO limit

Spark currently keeps live sockets, rate limits, discovery, requests, and chats in memory because they must disappear when a session ends. Keep `--max-instances=1`; Firestore is deliberately not used as a chat history or a Socket.IO adapter. Cloud Run supports WebSockets, but its session affinity is best-effort. To scale above one instance, add Memorystore (Redis) with the Socket.IO Redis adapter and move the temporary real-time state there.

Cloud Run also reconnects WebSocket clients when a request reaches the configured timeout; Spark's client should recover its temporary session on reconnect in a future hardening pass.
