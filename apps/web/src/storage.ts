// Small per-device conveniences. Everything is wrapped: storage can be blocked or empty.

const LAST_GROUP = "af:lastGroup";
const PENDING_INVITE = "af:pendingInvite";

function read(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store: Storage, key: string, value: string | null) {
  try {
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // ignore: the app works without it
  }
}

/** The last group the person opened (HU-02: the app remembers it). */
export const lastGroup = {
  get: () => read(localStorage, LAST_GROUP),
  set: (groupId: string) => write(localStorage, LAST_GROUP, groupId),
};

/** An invite link opened before signing in; resumed once the person is back from Google. */
export const pendingInvite = {
  get: () => read(sessionStorage, PENDING_INVITE),
  set: (token: string) => write(sessionStorage, PENDING_INVITE, token),
  clear: () => write(sessionStorage, PENDING_INVITE, null),
};
