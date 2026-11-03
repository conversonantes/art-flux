import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { FileStore, SignedDownload, SignedUpload } from "@art-flux/core";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

/** How long the phone has to start an upload after asking for the address. */
const UPLOAD_SECONDS = 600;

/**
 * Files in a private Cloudflare R2 bucket (S3-compatible). The bucket is never public: the phone
 * uploads to and reads from short-lived signed URLs that the API hands out after the core checks.
 */
export class R2FileStore implements FileStore {
  private readonly client: S3Client;

  constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    });
  }

  async signUpload({ path, mime, sizeBytes }: { path: string; mime: string; sizeBytes: number }): Promise<SignedUpload> {
    // Content type and length are part of the signature: the upload must be what was registered.
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: path,
      ContentType: mime,
      ContentLength: sizeBytes,
    });
    const url = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_SECONDS,
      signableHeaders: new Set(["content-type", "content-length"]),
    });
    return {
      url,
      method: "PUT",
      headers: { "content-type": mime },
      expiresAt: new Date(Date.now() + UPLOAD_SECONDS * 1000),
    };
  }

  async signDownload(path: string, expiresInSeconds: number): Promise<SignedDownload> {
    const url = await getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.config.bucket, Key: path }), {
      expiresIn: expiresInSeconds,
    });
    return { url, expiresAt: new Date(Date.now() + expiresInSeconds * 1000) };
  }

  async head(path: string): Promise<{ sizeBytes: number } | null> {
    try {
      const out = await this.client.send(new HeadObjectCommand({ Bucket: this.config.bucket, Key: path }));
      return { sizeBytes: out.ContentLength ?? 0 };
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || (e as { name?: string }).name === "NotFound") return null;
      throw e;
    }
  }

  async delete(path: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: path }));
  }
}

/**
 * Stands in while R2 is not configured, so the rest of the app still runs: anything that needs
 * a file says plainly what is missing instead of failing somewhere obscure.
 */
export class MissingFileStore implements FileStore {
  private fail(): never {
    throw new Error("Los archivos todavía no están configurados en el servidor (faltan las variables R2_* del .env).");
  }
  async signUpload(): Promise<SignedUpload> {
    return this.fail();
  }
  async signDownload(): Promise<SignedDownload> {
    return this.fail();
  }
  async head(): Promise<{ sizeBytes: number } | null> {
    return this.fail();
  }
  async delete(): Promise<void> {
    return this.fail();
  }
}
