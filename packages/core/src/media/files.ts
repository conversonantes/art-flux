/**
 * Where the files live (R2 today). The core decides paths, sizes and who may; this only signs and
 * checks. Files never pass through the API: the phone uploads to, and downloads from, the store.
 */
export interface SignedUpload {
  url: string;
  method: "PUT";
  /** Headers the upload request must carry (the signature covers them). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface SignedDownload {
  url: string;
  expiresAt: Date;
}

export interface FileStore {
  signUpload(input: { path: string; mime: string; sizeBytes: number }): Promise<SignedUpload>;
  signDownload(path: string, expiresInSeconds: number): Promise<SignedDownload>;
  /** The stored object's size, or null if it is not there. */
  head(path: string): Promise<{ sizeBytes: number } | null>;
  delete(path: string): Promise<void>;
}

/** A store in memory, for tests: `put` stands for the phone uploading to the signed URL. */
export class InMemoryFileStore implements FileStore {
  readonly objects = new Map<string, number>();
  readonly deleted: string[] = [];

  async signUpload({ path, mime, sizeBytes }: { path: string; mime: string; sizeBytes: number }): Promise<SignedUpload> {
    return {
      url: `https://files.test/${path}?signed=put`,
      method: "PUT",
      headers: { "content-type": mime, "x-expected-size": String(sizeBytes) },
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    };
  }

  async signDownload(path: string, expiresInSeconds: number): Promise<SignedDownload> {
    return {
      url: `https://files.test/${path}?signed=get`,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    };
  }

  async head(path: string) {
    const size = this.objects.get(path);
    return size === undefined ? null : { sizeBytes: size };
  }

  async delete(path: string) {
    this.objects.delete(path);
    this.deleted.push(path);
  }

  put(path: string, sizeBytes: number) {
    this.objects.set(path, sizeBytes);
  }
}
