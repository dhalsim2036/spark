# Spark

Spark is a mobile-first, temporary nearby-connection prototype. It has no accounts, user search, exact distances, permanent profiles, or stored chat history.

## Run it

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in two browser sessions. The server runs on port 3001. For local testing, browsers can use the same approximate geolocation or you can grant geolocation in separate windows.

## Privacy architecture

- Raw location remains server-side in memory and is used only for a 200m eligibility calculation.
- Other clients receive stable fuzzed marker coordinates, never exact coordinates or distances.
- Sessions, locations, requests, and chats are memory-only; disconnecting removes them. Reports are intentionally the sole moderation retention boundary (replace the console placeholder with Prisma persistence for production).
- Chat events use the server-bound socket session—not client-supplied sender IDs—and validate every participant/action.

## Production next steps

The included in-memory stores make the temporary lifecycle observable and easy to run locally. Before deployment, add Prisma/PostgreSQL persistence only for session expiry and reports, Redis for Socket.IO/rate limits, a signed/moderated object store for photos, HTTPS secure cookies, and a formal content-safety pipeline.

## Deploy to Google Cloud

Spark includes a Cloud Run `Dockerfile` and Cloud Build pipeline. Follow [the Cloud Run deployment guide](deploy/cloud-run.md) to build the image, connect Cloud SQL through Secret Manager, and deploy the public service.
