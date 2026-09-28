import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "./env";

/**
 * Almacenamiento PRIVADO de CV. Los archivos nunca se colocan en `public/` ni se sirven
 * por URL directa: sólo se entregan a través de `/admin/cv/[id]` tras autenticación.
 */
export interface PrivateStorage {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

/** Clave aleatoria: no deriva del nombre original ni de datos de la persona. */
export function newStorageKey(ext: string): string {
  return `cv/${randomUUID()}.${ext}`;
}

function assertSafeKey(key: string) {
  if (!/^cv\/[0-9a-f-]{36}\.(pdf|docx?|bin)$/.test(key)) throw new Error("Clave de almacenamiento inválida");
}

class LocalStorage implements PrivateStorage {
  constructor(private readonly root: string) {}
  private resolve(key: string) {
    assertSafeKey(key);
    const full = path.resolve(/* turbopackIgnore: true */ this.root, key);
    if (!full.startsWith(path.resolve(/* turbopackIgnore: true */ this.root) + path.sep)) throw new Error("Ruta fuera del almacenamiento");
    return full;
  }
  async put(key: string, bytes: Uint8Array) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    await writeFile(full, bytes, { mode: 0o600, flag: "wx" });
  }
  async get(key: string) {
    return new Uint8Array(await readFile(this.resolve(key)));
  }
  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

class S3Storage implements PrivateStorage {
  private client: S3Client;
  constructor(private readonly bucket: string) {
    const e = env();
    this.client = new S3Client({
      region: e.S3_REGION ?? "us-east-1",
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: Boolean(e.S3_ENDPOINT),
      credentials:
        e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }
  async put(key: string, bytes: Uint8Array, contentType: string) {
    assertSafeKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        ServerSideEncryption: "AES256",
      }),
    );
  }
  async get(key: string) {
    assertSafeKey(key);
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error("Objeto vacío");
    return res.Body.transformToByteArray();
  }
  async delete(key: string) {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

let instance: PrivateStorage | null = null;

export function storage(): PrivateStorage {
  if (!instance) {
    const e = env();
    if (e.STORAGE_DRIVER === "s3") {
      if (!e.S3_BUCKET) throw new Error("STORAGE_DRIVER=s3 requiere S3_BUCKET");
      instance = new S3Storage(e.S3_BUCKET);
    } else {
      instance = new LocalStorage(path.resolve(/* turbopackIgnore: true */ process.cwd(), e.STORAGE_LOCAL_DIR));
    }
  }
  return instance;
}
