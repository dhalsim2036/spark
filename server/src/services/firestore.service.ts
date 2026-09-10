import { randomUUID } from "node:crypto";
import {
  FIRESTORE_EMULATOR_HOST,
  FIRESTORE_PROJECT_ID,
} from "../config.js";

type FirestoreFields = Record<
  string,
  { stringValue?: string; timestampValue?: string }
>;

/**
 * Firestore is intentionally limited to the moderation boundary and anonymous
 * session expiry records. Profiles, locations, chat requests, and messages are
 * never sent here.
 */
export class FirestoreService {
  private accessToken?: { value: string; expiresAt: number };

  get enabled() {
    return Boolean(FIRESTORE_PROJECT_ID);
  }

  async createSession(sessionId: string, now = new Date()) {
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    await this.write("sessions", sessionId, {
      createdAt: { timestampValue: now.toISOString() },
      lastSeen: { timestampValue: now.toISOString() },
      expiresAt: { timestampValue: expiresAt },
    });
  }

  async touchSession(sessionId: string, now = new Date()) {
    await this.write(
      "sessions",
      sessionId,
      { lastSeen: { timestampValue: now.toISOString() } },
      ["lastSeen"],
    );
  }

  async deleteSession(sessionId: string) {
    await this.request(`sessions/${sessionId}`, { method: "DELETE" });
  }

  async createReport(input: {
    reporterSessionId: string;
    reportedSessionId: string;
    reason: string;
    createdAt: string;
  }) {
    await this.write("reports", randomUUID(), {
      reporterSessionId: { stringValue: input.reporterSessionId },
      reportedSessionId: { stringValue: input.reportedSessionId },
      reason: { stringValue: input.reason },
      createdAt: { timestampValue: input.createdAt },
    });
  }

  private async write(
    collection: "sessions" | "reports",
    id: string,
    fields: FirestoreFields,
    updateMask?: string[],
  ) {
    const query = updateMask?.length
      ? `?${updateMask.map((field) => `updateMask.fieldPaths=${field}`).join("&")}`
      : "";
    await this.request(`${collection}/${id}${query}`, {
      method: "PATCH",
      body: JSON.stringify({ fields }),
    });
  }

  private async request(path: string, init: RequestInit) {
    if (!FIRESTORE_PROJECT_ID) return;
    try {
      const base = FIRESTORE_EMULATOR_HOST
        ? `http://${FIRESTORE_EMULATOR_HOST}`
        : "https://firestore.googleapis.com";
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (!FIRESTORE_EMULATOR_HOST)
        headers.Authorization = `Bearer ${await this.getAccessToken()}`;
      const response = await fetch(
        `${base}/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents/${path}`,
        { ...init, headers: { ...headers, ...init.headers } },
      );
      if (!response.ok)
        throw new Error(`Firestore request failed (${response.status})`);
    } catch (error) {
      // The live Spark experience stays temporary if Firestore is unavailable.
      console.error("Firestore persistence failed", error);
    }
  }

  private async getAccessToken() {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 30_000)
      return this.accessToken.value;
    const response = await fetch(
      "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
      { headers: { "Metadata-Flavor": "Google" } },
    );
    if (!response.ok) throw new Error("Could not get Cloud Run service identity");
    const token = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = {
      value: token.access_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
    return token.access_token;
  }
}
