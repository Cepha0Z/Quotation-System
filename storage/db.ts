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

export function openInterixDatabase(): Promise<IDBDatabase> {
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
    const database = await openInterixDatabase();
    const transaction = database.transaction(STORE_NAME, 'readonly');
    return requestResult(
      transaction.objectStore(STORE_NAME).get(key),
    ) as Promise<T | undefined>;
  },
  async set<T>(key: string, value: T) {
    const database = await openInterixDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(structuredClone(value), key);
    await transactionDone(transaction);
  },
  async remove(key: string) {
    const database = await openInterixDatabase();
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  },
};
