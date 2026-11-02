/** A link works for 7 days after creation, unless spent or revoked first. */
export const INVITE_TTL_DAYS = 7;

export interface Invite {
  id: string;
  groupId: string;
  /** Secret that goes in the shared link. Unguessable. */
  token: string;
  /** Optional note for the admin ("para Ana"). Never shown to the invitee. */
  label?: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  /** Set when someone spends the link; the link is then dead for everybody else. */
  acceptedBy?: string;
  acceptedAt?: Date;
  revokedAt?: Date;
}

/** Unknown, revoked, expired or already used by someone else: all look the same on purpose. */
export class InviteInvalidError extends Error {
  constructor() {
    super("Este enlace ya no sirve. Pídele a un admin uno nuevo.");
    this.name = "InviteInvalidError";
  }
}

export interface InvitesRepo {
  save(invite: Invite): Promise<void>;
  findById(inviteId: string): Promise<Invite | null>;
  findByToken(token: string): Promise<Invite | null>;
  /** Not revoked, newest first: pending, used and expired ones, so the admin sees who joined. */
  listByGroup(groupId: string): Promise<Invite[]>;
  revoke(inviteId: string, at: Date): Promise<void>;
  /**
   * Spends the link and adds the user as a member, atomically. Throws InviteInvalidError
   * if someone else spent it first. Database-backed adapters must re-check everything
   * there: the core validated already, but the database is the security boundary.
   */
  accept(invite: Invite, userId: string, at: Date): Promise<void>;
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
