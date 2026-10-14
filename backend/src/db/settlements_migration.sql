-- Driver Settlements
-- A settlement is a formal pay statement given to a driver for a specific period.
-- It itemizes: loads hauled, gross pay, fuel advance deductions, insurance deductions, and net pay.

CREATE TABLE IF NOT EXISTS driver_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_number VARCHAR(100) UNIQUE NOT NULL,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Pay
  pay_type VARCHAR(50),          -- pulled from driver at time of settlement
  pay_rate NUMERIC(10,4),

  gross_pay NUMERIC(12,2) NOT NULL DEFAULT 0,

  -- Deductions
  fuel_advance NUMERIC(12,2) DEFAULT 0,
  insurance_deduction NUMERIC(12,2) DEFAULT 0,
  other_deduction NUMERIC(12,2) DEFAULT 0,
  other_deduction_note VARCHAR(255),

  total_deductions NUMERIC(12,2) GENERATED ALWAYS AS
    (COALESCE(fuel_advance,0) + COALESCE(insurance_deduction,0) + COALESCE(other_deduction,0)) STORED,

  net_pay NUMERIC(12,2) GENERATED ALWAYS AS
    (COALESCE(gross_pay,0) - (COALESCE(fuel_advance,0) + COALESCE(insurance_deduction,0) + COALESCE(other_deduction,0))) STORED,

  notes TEXT,
  status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Load line items included in a settlement
CREATE TABLE IF NOT EXISTS settlement_load_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id UUID NOT NULL REFERENCES driver_settlements(id) ON DELETE CASCADE,
  load_id UUID NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  load_number VARCHAR(100),
  pickup_date DATE,
  delivery_date DATE,
  origin VARCHAR(255),
  destination VARCHAR(255),
  miles NUMERIC(10,2),
  load_rate NUMERIC(12,2),     -- what the load billed
  driver_pay NUMERIC(12,2)     -- what driver earns from this load
);

CREATE INDEX IF NOT EXISTS idx_settlements_driver ON driver_settlements(driver_id);
CREATE INDEX IF NOT EXISTS idx_settlements_period ON driver_settlements(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_settlement_items_settlement ON settlement_load_items(settlement_id);
