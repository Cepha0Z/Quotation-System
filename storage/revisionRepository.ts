import type { Revision } from '../domain/types';
import { indexedDbStorage, type StorageAdapter } from './db';

const KEY = 'revisions';

export const createRevisionRepository = (storage: StorageAdapter) => ({
  list: async () => (await storage.get<Revision[]>(KEY)) ?? [],
  saveAll: (revisions: Revision[]) => storage.set(KEY, revisions),
  deleteForProject: async (projectId: string) => {
    const revisions = (await storage.get<Revision[]>(KEY)) ?? [];
    await storage.set(
      KEY,
      revisions.filter((revision) => revision.projectId !== projectId),
    );
  },
});

export const revisionRepository = createRevisionRepository(indexedDbStorage);
