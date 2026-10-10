/**
 * Photon messaging integration boundary — NOT IMPLEMENTED.
 * Owner: feat/chat-audio. Do not invent endpoints; fill in from Photon's real docs.
 * Until configured, `photonStatus()` reports "unconfigured" and no message is ever reported as sent.
 */
export interface PhotonClient {
  sendMessage(input: { to: string; text: string }): Promise<{ delivered: boolean; messageId: string }>;
}

export const photonClient: PhotonClient | null = null;

export function photonStatus(): "unconfigured" | "ready" {
  return photonClient ? "ready" : "unconfigured";
}
