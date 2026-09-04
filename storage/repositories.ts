import type {
  FirmSettings,
  Project,
  RateCardItem,
  Revision,
} from '../domain/types';
import { projectRepository } from './projectRepository';
import { rateCardRepository } from './rateCardRepository';
import { revisionRepository } from './revisionRepository';
import { settingsRepository } from './settingsRepository';

const LEGACY_KEYS = {
  projects: 'interix.projects.v1',
  rates: 'interix.rates.v1',
  settings: 'interix.settings.v1',
  revisions: 'interix.revisions.v1',
};

const legacyRead = <T>(key: string): T | undefined => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
};

export async function migrateLegacyStorage() {
  const [projects, rates, settings, revisions] = await Promise.all([
    projectRepository.list(),
    rateCardRepository.list(),
    settingsRepository.get(),
    revisionRepository.list(),
  ]);
  const writes: Promise<void>[] = [];
  if (!projects.length) {
    const legacy = legacyRead<Project[]>(LEGACY_KEYS.projects);
    if (legacy?.length) writes.push(projectRepository.saveAll(legacy));
  }
  if (!rates.length) {
    const legacy = legacyRead<RateCardItem[]>(LEGACY_KEYS.rates);
    if (legacy?.length) writes.push(rateCardRepository.saveAll(legacy));
  }
  if (!settings) {
    const legacy = legacyRead<FirmSettings>(LEGACY_KEYS.settings);
    if (legacy) writes.push(settingsRepository.save(legacy));
  }
  if (!revisions.length) {
    const legacy = legacyRead<Revision[]>(LEGACY_KEYS.revisions);
    if (legacy?.length) writes.push(revisionRepository.saveAll(legacy));
  }
  await Promise.all(writes);
}

export {
  projectRepository,
  rateCardRepository,
  revisionRepository,
  settingsRepository,
};
