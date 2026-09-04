import type { Project } from '../domain/types';
import { indexedDbStorage, type StorageAdapter } from './db';

const KEY = 'projects';

export const createProjectRepository = (storage: StorageAdapter) => ({
  list: async () => (await storage.get<Project[]>(KEY)) ?? [],
  saveAll: (projects: Project[]) => storage.set(KEY, projects),
  delete: async (projectId: string) => {
    const projects = (await storage.get<Project[]>(KEY)) ?? [];
    await storage.set(
      KEY,
      projects.filter((project) => project.id !== projectId),
    );
  },
});

export const projectRepository = createProjectRepository(indexedDbStorage);
