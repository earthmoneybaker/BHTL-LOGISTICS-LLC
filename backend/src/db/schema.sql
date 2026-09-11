-- BHTL Logistics LLC — Full TMS Schema

-- Enable UUID extension
-- CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMPANY SETTINGS
-- ============================================================
CREATE TABLE IF NOT EXISTS company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name VARCHAR(255) NOT NULL DEFAULT 'BHTL Logistics LLC',
  mc_number VARCHAR(100),
  dot_number VARCHAR(100),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  phone VARCHAR(50),
  email VARCHAR(255),
  ifta_license VARCHAR(100),
  base_state VARCHAR(10) DEFAULT 'OH',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO company_settings (company_name, city, state, base_state)
VALUES ('BHTL Logistics LLC', 'Dayton', 'OH', 'OH')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  address_line1 VARCHAR(255),
  address_line2 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  payment_terms VARCHAR(100) DEFAULT 'Net 30',
  credit_limit NUMERIC(12,2),
  credit_notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DRIVERS
-- ============================================================
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50),
  address_line1 VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  cdl_number VARCHAR(100),
  cdl_class VARCHAR(10),
  cdl_endorsements VARCHAR(100),
  cdl_expiration DATE,
  medical_card_expiration DATE,
  hire_date DATE,
  termination_date DATE,
  pay_type VARCHAR(50) CHECK (pay_type IN ('per_mile', 'percentage', 'hourly', 'salary')),
  pay_rate NUMERIC(10,4),
  clearinghouse_status VARCHAR(100),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Driver Qualification File items
CREATE TABLE IF NOT EXISTS driver_dq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  item_name VARCHAR(255) NOT NULL,
  is_complete BOOLEAN NOT NULL DEFAULT FALSE,
  completed_date DATE,
  expiration_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRUCKS
-- ============================================================
CREATE TABLE IF NOT EXISTS trucks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number VARCHAR(50) UNIQUE NOT NULL,
  vin VARCHAR(50),
  plate_number VARCHAR(50),
  plate_state VARCHAR(10),
  year INTEGER,
  make VARCHAR(100),
  model VARCHAR(100),
  registration_expiration DATE,
  irp_status VARCHAR(100),
  irp_expiration DATE,
  current_mileage INTEGER,
  assigned_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'in_shop', 'out_of_service', 'sold')),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TRAILERS
-- ============================================================
CREATE TABLE IF NOT EXISTS trailers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_number VARCHAR(50) UNIQUE NOT NULL,
  vin VARCHAR(50),
  plate_number VARCHAR(50),
  plate_state VARCHAR(10),
  trailer_type VARCHAR(100),
  year INTEGER,
  make VARCHAR(100),
  registration_expiration DATE,
  assigned_truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'in_shop', 'out_of_service', 'sold')),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LOADS
-- ============================================================
CREATE TABLE IF NOT EXISTS loads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_number VARCHAR(100) UNIQUE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  origin_address VARCHAR(255),
  origin_city VARCHAR(100),
  origin_state VARCHAR(50),
  origin_zip VARCHAR(20),
  destination_address VARCHAR(255),
  destination_city VARCHAR(100),
  destination_state VARCHAR(50),
  destination_zip VARCHAR(20),
  pickup_date DATE,
  pickup_time VARCHAR(20),
  delivery_date DATE,
  delivery_time VARCHAR(20),
  rate NUMERIC(12,2),
  weight NUMERIC(10,2),
  commodity VARCHAR(255),
  miles NUMERIC(10,2),
  truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  trailer_id UUID REFERENCES trailers(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','dispatched','in_transit','delivered','invoiced','paid','cancelled')),
  po_number VARCHAR(100),
  bol_number VARCHAR(100),
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS (generic doc store for all entity types)
-- ============================================================
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(50) NOT NULL
    CHECK (entity_type IN ('driver','truck','trailer','load','company')),
  entity_id UUID,
  doc_type VARCHAR(100) NOT NULL,
  file_name VARCHAR(255),
  file_data BYTEA,
  file_mime VARCHAR(100),
  expiration_date DATE,
  notes TEXT,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MAINTENANCE RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('truck','trailer')),
  truck_id UUID REFERENCES trucks(id) ON DELETE CASCADE,
  trailer_id UUID REFERENCES trailers(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_type VARCHAR(255) NOT NULL,
  description TEXT,
  vendor VARCHAR(255),
  cost NUMERIC(10,2),
  mileage_at_service INTEGER,
  next_due_mileage INTEGER,
  next_due_date DATE,
  dot_inspection BOOLEAN DEFAULT FALSE,
  dot_inspection_expiration DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INVOICES
-- ============================================================
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number VARCHAR(100) UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  amount NUMERIC(12,2) NOT NULL,
  date_issued DATE NOT NULL,
  due_date DATE NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid','paid','overdue','voided')),
  factoring_company VARCHAR(255),
  factoring_notes TEXT,
  paid_date DATE,
  paid_amount NUMERIC(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category VARCHAR(100) NOT NULL
    CHECK (category IN ('fuel','repairs_maintenance','truck_payments_leases','insurance','tolls','permits_registration','factoring_fees','dispatch_loadboard_software','meals_travel','lumper_unloading','office_phone_internet','bank_fees','other')),
  amount NUMERIC(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  description VARCHAR(500),
  truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  vendor VARCHAR(255),
  receipt_ref VARCHAR(255),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- PAYROLL RECORDS
-- ============================================================
CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL,
  person_type VARCHAR(20) NOT NULL CHECK (person_type IN ('driver','staff')),
  driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pay_type VARCHAR(50),
  pay_rate NUMERIC(10,4),
  gross_pay NUMERIC(12,2) NOT NULL,
  deductions NUMERIC(12,2) DEFAULT 0,
  deduction_notes TEXT,
  net_pay NUMERIC(12,2),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payroll load breakdown (which loads contributed to this payroll)
CREATE TABLE IF NOT EXISTS payroll_load_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id UUID NOT NULL REFERENCES payroll_records(id) ON DELETE CASCADE,
  load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  miles NUMERIC(10,2),
  rate_amount NUMERIC(12,2),
  driver_pay NUMERIC(12,2)
);

-- ============================================================
-- P&L SNAPSHOTS (stored for historical accuracy)
-- ============================================================
CREATE TABLE IF NOT EXISTS pnl_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('month','quarter','year')),
  period_label VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_revenue NUMERIC(12,2) DEFAULT 0,
  total_expenses NUMERIC(12,2) DEFAULT 0,
  total_payroll NUMERIC(12,2) DEFAULT 0,
  net_profit NUMERIC(12,2) DEFAULT 0,
  snapshot_data JSONB,
  snapped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUEL PURCHASES (IFTA)
-- ============================================================
CREATE TABLE IF NOT EXISTS fuel_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id UUID REFERENCES trucks(id) ON DELETE SET NULL,
  purchase_date DATE NOT NULL,
  state VARCHAR(10) NOT NULL,
  gallons NUMERIC(10,3) NOT NULL,
  cost_per_gallon NUMERIC(10,4),
  total_cost NUMERIC(12,2),
  vendor VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Miles by state per truck (for IFTA — entered manually per load or trip)
CREATE TABLE IF NOT EXISTS miles_by_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id UUID REFERENCES trucks(id) ON DELETE CASCADE,
  load_id UUID REFERENCES loads(id) ON DELETE SET NULL,
  state VARCHAR(10) NOT NULL,
  miles NUMERIC(10,2) NOT NULL,
  trip_date DATE NOT NULL,
  quarter VARCHAR(10),
  year INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_loads_status ON loads(status);
CREATE INDEX IF NOT EXISTS idx_loads_customer ON loads(customer_id);
CREATE INDEX IF NOT EXISTS idx_loads_driver ON loads(driver_id);
CREATE INDEX IF NOT EXISTS idx_loads_truck ON loads(truck_id);
CREATE INDEX IF NOT EXISTS idx_loads_pickup_date ON loads(pickup_date);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_truck ON expenses(truck_id);
CREATE INDEX IF NOT EXISTS idx_fuel_truck ON fuel_purchases(truck_id);
CREATE INDEX IF NOT EXISTS idx_fuel_state ON fuel_purchases(state);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_expiration ON documents(expiration_date);
CREATE INDEX IF NOT EXISTS idx_maintenance_truck ON maintenance_records(truck_id);
CREATE INDEX IF NOT EXISTS idx_payroll_driver ON payroll_records(driver_id);
