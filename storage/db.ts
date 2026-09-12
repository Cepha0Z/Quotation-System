const DATABASE_NAME = 'interix-local-database';
const DATABASE_VERSION = 1;
const STORE_NAME = 'app-state';

export interface StorageAdapter {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Storage request failed'));
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Storage transaction failed'));
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('Storage transaction was cancelled'),
      );
  });

let databasePromise: Promise<IDBDatabase> | undefined;

export function openLocalDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('Local database is unavailable'));
      return;
    }
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error('Unable to open local database'));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('Local database upgrade was blocked'));
    };
  });
  return databasePromise;
}

export const indexedDbStorage: StorageAdapter = {
  async get<T>(key: string) {
    const database = await openLocalDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    return requestResult(
      transaction.objectStore(STORE_NAME).get(key),
    ) as Promise<T | undefined>;
  },
  async set<T>(key: string, value: T) {
    const database = await openLocalDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(structuredClone(value), key);
    await transactionDone(transaction);
  },
  async remove(key: string) {
    const database = await openLocalDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  },
};

const SHARED_STATE_ENDPOINT = '/api/workspace-state';

type SharedStateResponse<T> = { found: true; value: T } | { found: false };

async function readSharedValue<T>(
  key: string,
): Promise<SharedStateResponse<T>> {
  const response = await fetch(
    `${SHARED_STATE_ENDPOINT}/${encodeURIComponent(key)}`,
    {
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error('The shared workspace is unavailable');
  return response.json() as Promise<SharedStateResponse<T>>;
}

async function writeSharedValue<T>(key: string, value: T): Promise<void> {
  const response = await fetch(
    `${SHARED_STATE_ENDPOINT}/${encodeURIComponent(key)}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value }),
    },
  );
  if (!response.ok) throw new Error('The shared workspace could not be saved');
}

/**
 * Server state is authoritative. IndexedDB remains as a device cache and also
 * lets an existing browser migrate its pre-shared workspace on first launch.
 */
export const sharedWorkspaceStorage: StorageAdapter = {
  async get<T>(key: string) {
    try {
      const shared = await readSharedValue<T>(key);
      if (shared.found) {
        await indexedDbStorage.set(key, shared.value);
        return shared.value;
      }

      const local = await indexedDbStorage.get<T>(key);
      if (local !== undefined) {
        await writeSharedValue(key, local);
        return local;
      }
      return undefined;
    } catch (error) {
      const local = await indexedDbStorage.get<T>(key);
      if (local !== undefined) return local;
      throw error;
    }
  },
  async set<T>(key: string, value: T) {
    await indexedDbStorage.set(key, value);
    await writeSharedValue(key, value);
  },
  async remove(key: string) {
    await indexedDbStorage.remove(key);
    const response = await fetch(
      `${SHARED_STATE_ENDPOINT}/${encodeURIComponent(key)}`,
      { method: 'DELETE' },
    );
    if (!response.ok)
      throw new Error('The shared workspace could not be updated');
  },
};
