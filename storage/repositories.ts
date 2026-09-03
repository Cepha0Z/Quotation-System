import type { FirmSettings, Project, RateCardItem, Revision } from '../domain/types';

const KEYS = { projects: 'interix.projects.v1', rates: 'interix.rates.v1', settings: 'interix.settings.v1', revisions: 'interix.revisions.v1' };
const read = <T>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } };
const write = <T>(key: string, value: T) => localStorage.setItem(key, JSON.stringify(value));
export const projectRepository = { list: (fallback: Project[] = []) => read(KEYS.projects, fallback), saveAll: (v: Project[]) => write(KEYS.projects, v) };
export const rateCardRepository = { list: (fallback: RateCardItem[] = []) => read(KEYS.rates, fallback), saveAll: (v: RateCardItem[]) => write(KEYS.rates, v) };
export const settingsRepository = { get: (fallback: FirmSettings) => read(KEYS.settings, fallback), save: (v: FirmSettings) => write(KEYS.settings, v) };
export const revisionRepository = { list: () => read<Revision[]>(KEYS.revisions, []), saveAll: (v: Revision[]) => write(KEYS.revisions, v) };
