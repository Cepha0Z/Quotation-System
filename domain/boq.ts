import type {
  BoqUnit,
  Floor,
  MeasurementType,
  Project,
  QuoteItem,
} from './types';

export const WORK_TYPES = [
  'Civil Work',
  'Millwork',
  'Bought Out',
  'Electrical',
  'Plumbing',
  'Flooring',
  'Wall / Ceiling Finishes',
  'Doors / Glass / Metal',
  'Soft Furnishings',
  'Furniture',
  'Décor / Styling',
  'Other',
] as const;

export const FLOOR_SUGGESTIONS = [
  'Basement',
  'Ground Floor',
  'First Floor',
  'Second Floor',
  'Third Floor',
  'Terrace',
];

export const SPACE_SUGGESTIONS = [
  'Parking',
  'Foyer',
  'Living Room',
  'Family Lounge',
  'Dining',
  'Entertainment Room',
  'Kitchen',
  'Pantry',
  'Utility',
  'Master Bedroom',
  'Bedroom',
  'Guest Bedroom',
  "Children's Bedroom",
  'Study / Home Office',
  'Walk-in Wardrobe',
  'Dressing Room',
  'Bathroom',
  'Master Bathroom',
  'Powder Room',
  'Pooja Room',
  'Store Room',
  'Janitor Room',
  'Balcony',
  'Corridor / Passage',
  'Staircase',
  'Terrace',
];

export const measurementForUnit = (unit: BoqUnit): MeasurementType =>
  unit === 'Sq.ft'
    ? 'sqft'
    : unit === 'R.ft'
      ? 'rft'
      : unit === 'Lump Sum'
        ? 'flat'
        : 'quantity';

export const unitForMeasurement = (measurement: MeasurementType): BoqUnit =>
  measurement === 'sqft'
    ? 'Sq.ft'
    : measurement === 'rft'
      ? 'R.ft'
      : measurement === 'flat'
        ? 'Lump Sum'
        : 'Nos';

export function normalizeProject(project: Project): Project {
  const legacyFloor: Floor = {
    id: `legacy-floor-${project.id}`,
    name: 'Ground Floor',
  };
  const floors = project.floors?.length ? project.floors : [legacyFloor];
  return {
    ...project,
    floors,
    propertyType: project.propertyType ?? '',
    location: project.location ?? '',
    notes: project.notes ?? '',
    rooms: project.rooms.map((space) => ({
      ...space,
      floorId: floors.some((floor) => floor.id === space.floorId)
        ? space.floorId
        : floors[0].id,
      items: space.items.map(
        (item): QuoteItem => ({
          ...item,
          workType: item.workType ?? 'Millwork',
          unit: item.unit ?? unitForMeasurement(item.measurementType),
          pricingMode:
            item.pricingMode ??
            (item.measurementType === 'flat' ? 'lump-sum' : 'unit'),
          dimensionUnit: item.dimensionUnit ?? 'ft',
          hsnCode: item.hsnCode ?? '',
          measureMode:
            item.measureMode ??
            (item.measurementType === 'sqft' || item.measurementType === 'rft'
              ? 'dimensions'
              : 'quantity'),
        }),
      ),
    })),
  };
}
