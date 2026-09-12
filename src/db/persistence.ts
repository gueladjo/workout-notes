/**
 * Durable storage for the SQLite database bytes, using IndexedDB.
 *
 * Layout: one IndexedDB database `workoutnotes` with two object stores:
 *   - `blobs`: key -> Uint8Array of a complete SQLite file
 *   - `meta`:  key -> { savedAt, label, size } so snapshots can be listed without loading bytes
 *
 * Keys: `main` is the live database. `snapshot:<ISO timestamp>` are rollback copies created before
 * destructive operations (restore, delete history). See doc/storage.md for the contract.
 */

const IDB_NAME = 'workoutnotes';
const IDB_VERSION = 1;
const BLOBS = 'blobs';
const META = 'meta';

export const MAIN_KEY = 'main';
export const SNAPSHOT_PREFIX = 'snapshot:';
export const MAX_SNAPSHOTS = 5;

export interface StoredFileMeta {
  key: string;
  savedAt: string;
  label: string;
  size: number;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BLOBS)) db.createObjectStore(BLOBS);
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function readBlob(key: string): Promise<Uint8Array | undefined> {
  const idb = await openIdb();
  try {
    const tx = idb.transaction(BLOBS, 'readonly');
    const value = await requestToPromise(tx.objectStore(BLOBS).get(key));
    if (value === undefined) return undefined;
    // Some browsers hand back an ArrayBuffer for structured-cloned typed arrays.
    return value instanceof Uint8Array ? value : new Uint8Array(value as ArrayBuffer);
  } finally {
    idb.close();
  }
}

export async function writeBlob(key: string, bytes: Uint8Array, label = ''): Promise<void> {
  const idb = await openIdb();
  try {
    const tx = idb.transaction([BLOBS, META], 'readwrite');
    tx.objectStore(BLOBS).put(bytes, key);
    const meta: StoredFileMeta = { key, savedAt: new Date().toISOString(), label, size: bytes.byteLength };
    tx.objectStore(META).put(meta);
    await txDone(tx);
  } finally {
    idb.close();
  }
}

export async function deleteBlob(key: string): Promise<void> {
  const idb = await openIdb();
  try {
    const tx = idb.transaction([BLOBS, META], 'readwrite');
    tx.objectStore(BLOBS).delete(key);
    tx.objectStore(META).delete(key);
    await txDone(tx);
  } finally {
    idb.close();
  }
}

export async function listStoredFiles(): Promise<StoredFileMeta[]> {
  const idb = await openIdb();
  try {
    const tx = idb.transaction(META, 'readonly');
    const rows = await requestToPromise(tx.objectStore(META).getAll());
    return (rows as StoredFileMeta[]).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
  } finally {
    idb.close();
  }
}

/** Save a rollback snapshot and prune old ones so at most MAX_SNAPSHOTS remain. */
export async function saveSnapshot(bytes: Uint8Array, label: string): Promise<string> {
  const key = SNAPSHOT_PREFIX + new Date().toISOString();
  await writeBlob(key, bytes, label);
  const snapshots = (await listStoredFiles()).filter((f) => f.key.startsWith(SNAPSHOT_PREFIX));
  for (const old of snapshots.slice(MAX_SNAPSHOTS)) await deleteBlob(old.key);
  return key;
}

export async function listSnapshots(): Promise<StoredFileMeta[]> {
  return (await listStoredFiles()).filter((f) => f.key.startsWith(SNAPSHOT_PREFIX));
}

/** Ask the browser not to evict our storage under pressure. Best effort; returns the granted state. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageStatus(): Promise<{ persisted: boolean; usage?: number; quota?: number }> {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false;
    const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : {};
    return { persisted, usage: estimate.usage, quota: estimate.quota };
  } catch {
    return { persisted: false };
  }
}
