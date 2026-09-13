import type { Fee } from './types';

// The existing new-project fee defaults, shared by browser and trusted worker.
export function createDefaultFees(): Fee[] {
  return [
    { id: 'design', name: 'Design Fee', method: 'sqft', value: 50, discount: 0, enabled: true },
    { id: 'drawing', name: '3D / Drawing', method: 'flat', value: 35000, discount: 0, enabled: true },
    { id: 'supervision', name: 'Site Supervision', method: 'flat', value: 45000, discount: 0, enabled: true },
  ];
}
