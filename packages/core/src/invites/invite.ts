import { z } from "zod";

/** Emails are compared case-insensitively; this is the one canonical form. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Escribe un correo válido"));

export interface Invite {
  id: string;
  groupId: string;
  /** Normalized (trimmed, lowercase). Only this email can use the link. */
  email: string;
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

/** The link is valid but was issued to a different email than the one logged in. */
export class InviteEmailMismatchError extends Error {
  constructor() {
    super("Esta invitación es para otro correo. Inicia sesión con el correo al que te invitaron.");
    this.name = "InviteEmailMismatchError";
  }
}

export interface InvitesRepo {
  save(invite: Invite): Promise<void>;
  findById(inviteId: string): Promise<Invite | null>;
  findByToken(token: string): Promise<Invite | null>;
  findActiveByGroupAndEmail(groupId: string, email: string): Promise<Invite | null>;
  listActiveByGroup(groupId: string): Promise<Invite[]>;
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
