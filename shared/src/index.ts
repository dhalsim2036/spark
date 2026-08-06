export const LIMITS = {
  displayName: 30,
  initialMessage: 300,
  chatMessage: 1000,
  photoBytes: 2_000_000,
  discoveryMeters: 200,
  locationUpdateMs: 300_000,
  sessionTtlMs: 30 * 60 * 1000,
} as const;
export const AVATARS = [
  "🌙",
  "⭐",
  "✨",
  "🪐",
  "🌍",
  "🌕",
  "☄️",
  "🌠",
] as const;
export type Gender = "woman" | "man" | "nonbinary" | "self_describe";
export interface TemporaryProfile {
  displayName: string;
  avatar: string;
  photoUrl?: string;
  gender?: Gender;
}
export interface UserSession {
  id: string;
  profile: TemporaryProfile;
  createdAt: string;
  lastSeen: string;
}
export interface NearbyUser {
  id: string;
  profile: Pick<TemporaryProfile, "displayName" | "avatar" | "photoUrl">;
  position: { lat: number; lng: number };
}
export interface ChatRequest {
  id: string;
  fromId: string;
  toId: string;
  message: string;
  createdAt: string;
}
export interface Message {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
}
export interface Chat {
  id: string;
  participants: [string, string];
  createdAt: string;
}
export type ReportReason =
  | "Harassment"
  | "Spam"
  | "Inappropriate content"
  | "Inappropriate profile photo"
  | "Other";
export interface Report {
  reporterSessionId: string;
  reportedSessionId: string;
  reason: ReportReason;
  createdAt: string;
}
