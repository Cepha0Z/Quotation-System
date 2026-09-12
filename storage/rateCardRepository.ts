import type { RateCardItem } from '../domain/types';
import { sharedWorkspaceStorage, type StorageAdapter } from './db';

const KEY = 'rate-card';

export const createRateCardRepository = (storage: StorageAdapter) => ({
  list: async () => (await storage.get<RateCardItem[]>(KEY)) ?? [],
  saveAll: (items: RateCardItem[]) => storage.set(KEY, items),
});

export const rateCardRepository = createRateCardRepository(
  sharedWorkspaceStorage,
);
