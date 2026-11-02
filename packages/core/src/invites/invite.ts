export interface Invite {
  id: string;
  groupId: string;
  /** Secret that goes in the shared link. Unguessable. */
  token: string;
  createdBy: string;
  createdAt: Date;
  revokedAt?: Date;
}

/** The link was revoked, never existed, or its group is gone. */
export class InviteInvalidError extends Error {
  constructor() {
    super("Este enlace ya no sirve. Pídele a un admin uno nuevo.");
    this.name = "InviteInvalidError";
  }
}

export interface InvitesRepo {
  save(invite: Invite): Promise<void>;
  findActiveByGroup(groupId: string): Promise<Invite | null>;
  findByToken(token: string): Promise<Invite | null>;
  revoke(inviteId: string, at: Date): Promise<void>;
}

export interface TokenGenerator {
  next(): string;
}

/** 32 random bytes, base64url. Uses Web Crypto (Node 22, browsers, edge). */
export const randomTokenGenerator: TokenGenerator = {
  next() {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
};
