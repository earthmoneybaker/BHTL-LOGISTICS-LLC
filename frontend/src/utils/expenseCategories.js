export const EXPENSE_CATEGORIES = [
  { value: 'fuel', label: 'Fuel' },
  { value: 'repairs_maintenance', label: 'Truck Repairs & Maintenance' },
  { value: 'truck_payments_leases', label: 'Truck Payments / Leases' },
  { value: 'insurance', label: 'Commercial Auto Insurance' },
  { value: 'tolls', label: 'Tolls' },
  { value: 'permits_registration', label: 'Permits / Registration / IRP / IFTA' },
  { value: 'factoring_fees', label: 'Factoring Fees / Charges' },
  { value: 'dispatch_loadboard_software', label: 'Dispatch / Load Board / Software' },
  { value: 'meals_travel', label: 'Meals / Travel' },
  { value: 'lumper_unloading', label: 'Lumper / Unloading' },
  { value: 'office_phone_internet', label: 'Office / Phone / Internet' },
  { value: 'bank_fees', label: 'Bank Fees' },
  { value: 'other', label: 'Other Business Expenses' },
];

export function categoryLabel(value) {
  const match = EXPENSE_CATEGORIES.find(c => c.value === value);
  return match ? match.label : value;
}
