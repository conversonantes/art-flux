/**
 * What the web needs from an identity provider. Nothing here mentions Supabase:
 * `credential` is opaque to the screens and is only forwarded to the API.
 */
export interface AuthUser {
  id: string;
  name?: string;
  email?: string;
}

export interface AuthSession {
  user: AuthUser;
  credential: string;
}

export interface AuthClient {
  getSession(): Promise<AuthSession | null>;
  /** Starts the Google flow; the page navigates away and comes back signed in. */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
  /** Calls back on every sign-in, sign-out and token refresh. Returns an unsubscribe function. */
  onChange(callback: (session: AuthSession | null) => void): () => void;
}
