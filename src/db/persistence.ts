/**
 * Durable storage for the SQLite database bytes, using IndexedDB.
 *
 * Layout: one IndexedDB database `workoutnotes` with two object stores:
 *   - `blobs`: key -> Uint8Array of a complete SQLite file
 *   - `meta`:  key -> { savedAt, label, size } so snapshots can be listed without loading bytes
 *
 * Keys: `main` is the live database. `snapshot:<ISO timestamp>` are rollback copies created before
 * destructive operations (restore, delete history, ...) and of a database the app could not open
 * (`src/app/recovery.ts`). See doc/storage.md for the contract.
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

/** Sort stored file metadata newest-first (deterministic when timestamps tie). */
function compareMetaDesc(a: StoredFileMeta, b: StoredFileMeta): number {
  if (a.savedAt !== b.savedAt) return a.savedAt < b.savedAt ? 1 : -1;
  return a.key < b.key ? 1 : a.key > b.key ? -1 : 0;
}

export async function listStoredFiles(): Promise<StoredFileMeta[]> {
  const idb = await openIdb();
  try {
    const tx = idb.transaction(META, 'readonly');
    const rows = await requestToPromise(tx.objectStore(META).getAll());
    return (rows as StoredFileMeta[]).sort(compareMetaDesc);
  } finally {
    idb.close();
  }
}

/**
 * Save a rollback snapshot and prune old ones so at most MAX_SNAPSHOTS remain. Write and prune
 * share one readwrite transaction so concurrent callers serialize cleanly, same-millisecond calls
 * never overwrite each other, and a backward clock jump cannot prune the snapshot just written.
 */
export async function saveSnapshot(bytes: Uint8Array, label: string): Promise<string> {
  const idb = await openIdb();
  try {
    const tx = idb.transaction([BLOBS, META], 'readwrite');
    const blobs = tx.objectStore(BLOBS);
    const metaStore = tx.objectStore(META);
    let key = '';
    let putError: unknown = null;
    // Queue every write synchronously inside onsuccess so WebKit cannot auto-commit the transaction
    // across a Promise microtask between getAll() and put().
    const getAllReq = metaStore.getAll();
    getAllReq.onsuccess = () => {
      const existing = getAllReq.result as StoredFileMeta[];
      const savedAt = new Date().toISOString();
      const base = SNAPSHOT_PREFIX + savedAt;
      let maxSeq = -1;
      for (const f of existing) {
        if (f.key === base) maxSeq = Math.max(maxSeq, 0);
        else if (f.key.startsWith(`${base}-`)) {
          const seq = Number(f.key.slice(base.length + 1));
          if (Number.isInteger(seq) && seq > maxSeq) maxSeq = seq;
        }
      }
      key = maxSeq < 0 ? base : `${base}-${String(maxSeq + 1).padStart(4, '0')}`;
      const entry: StoredFileMeta = { key, savedAt, label, size: bytes.byteLength };
      try {
        blobs.put(bytes, key);
        metaStore.put(entry);
        const others = existing.filter((f) => f.key.startsWith(SNAPSHOT_PREFIX)).sort(compareMetaDesc);
        for (const old of others.slice(MAX_SNAPSHOTS - 1)) {
          blobs.delete(old.key);
          metaStore.delete(old.key);
        }
      } catch (err) {
        putError = err;
        try {
          tx.abort();
        } catch {
          // Already aborting or finished.
        }
      }
    };
    try {
      await txDone(tx);
    } catch (err) {
      throw putError ?? err;
    }
    return key;
  } finally {
    idb.close();
  }
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
