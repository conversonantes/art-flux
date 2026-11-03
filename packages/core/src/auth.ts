/**
 * Who is calling (the login session, not a rehearsal session). The core and the routes only ever read `userId`.
 * `credential` is whatever the identity provider issued (today a JWT); it is opaque
 * everywhere except inside the adapter that created the session.
 */
export interface AuthSession {
  userId: string;
  credential: string;
}

/** Turns a credential from a request into an AuthSession, or null if it is not valid. */
export interface Authenticator {
  authenticate(credential: string): Promise<AuthSession | null>;
}
