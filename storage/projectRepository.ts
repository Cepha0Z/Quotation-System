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
  deleteRoom: async (projectId: string, roomId: string) => {
    const projects = (await storage.get<Project[]>(KEY)) ?? [];
    await storage.set(
      KEY,
      projects.map((project) =>
        project.id === projectId
          ? {
              ...project,
              updatedAt: new Date().toISOString(),
              rooms: project.rooms.filter((room) => room.id !== roomId),
            }
          : project,
      ),
    );
  },
});

export const projectRepository = createProjectRepository(indexedDbStorage);
