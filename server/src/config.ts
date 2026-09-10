import { LIMITS } from "@spark/shared";
export { LIMITS };
export const PORT = Number(process.env.PORT ?? 3001);
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN;
export const FIRESTORE_PROJECT_ID = process.env.FIRESTORE_PROJECT_ID;
export const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST;
export const HEARTBEAT_TIMEOUT_MS = 90_000;
export const REQUEST_LIMIT = { count: 3, windowMs: 60_000 };
export const MESSAGE_LIMIT = { count: 15, windowMs: 10_000 };
