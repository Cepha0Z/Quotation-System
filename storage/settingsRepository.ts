import type { FirmSettings } from '../domain/types';
import { indexedDbStorage, type StorageAdapter } from './db';

const KEY = 'firm-settings';

export const createSettingsRepository = (storage: StorageAdapter) => ({
  get: () => storage.get<FirmSettings>(KEY),
  save: (settings: FirmSettings) => storage.set(KEY, settings),
});

export const settingsRepository = createSettingsRepository(indexedDbStorage);
