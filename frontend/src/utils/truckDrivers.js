// ── Truck → Driver and Fuel Card mappings ─────────────────────────────────
// Keyed by truck UNIT NUMBER (the number printed on the truck)
// These are the known assignments for BHTL Logistics LLC

export const TRUCK_DRIVERS = {
  '494': {
    drivers: ['Abdalla Othman'],
    isTeam: false,
    cards: ['***877'],
  },
  '445': {
    drivers: ['Haji M Athman'],
    isTeam: false,
    cards: ['***839', '***026'],
  },
  '997': {
    drivers: ['Joseph', 'Abdulkadir'],
    isTeam: true,
    cards: ['***697', '***689'],  // Joseph→697, Abdulkadir→689
  },
};

// Individual card → driver mapping
export const CARD_DRIVER_MAP = {
  '839': 'Haji M Athman',
  '026': 'Haji M Athman',
  '877': 'Abdalla Othman',
  '697': 'Joseph',
  '689': 'Abdulkadir',
};

// Individual card → truck unit mapping
export const CARD_TRUCK_MAP = {
  '839': '445',
  '026': '445',
  '877': '494',
  '697': '997',
  '689': '997',
};

/**
 * Returns driver name(s) for a truck unit number.
 * Falls back to the DB-joined driver name if not in the map.
 * @param {string|number} unitNumber - e.g. '494'
 * @param {string} [dbDriverName] - fallback from DB join
 */
export function getDriverForTruck(unitNumber, dbDriverName = null) {
  const unit = String(unitNumber || '');
  if (TRUCK_DRIVERS[unit]) {
    return TRUCK_DRIVERS[unit].drivers.join(' & ');
  }
  return dbDriverName || null;
}

/**
 * Returns fuel cards for a truck unit number as "***XXX, ***YYY"
 * @param {string|number} unitNumber
 */
export function getCardsForTruck(unitNumber) {
  const unit = String(unitNumber || '');
  return TRUCK_DRIVERS[unit]?.cards || [];
}

/**
 * Formats last3 as ***XXX
 */
export function formatCardNumber(last3) {
  if (!last3) return null;
  return `***${String(last3).slice(-3).padStart(3, '0')}`;
}

/**
 * Returns "Truck #XXX — Driver Name" label for dropdowns/tables
 */
export function truckLabel(unitNumber, dbDriverName = null) {
  const unit = String(unitNumber || '');
  const driver = getDriverForTruck(unit, dbDriverName);
  if (!driver) return `#${unit}`;
  return `#${unit} — ${driver}`;
}
