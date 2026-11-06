-- Staff members table (non-driver employees for P&L tracking)
CREATE TABLE IF NOT EXISTS staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(100) NOT NULL DEFAULT 'Staff',
  email VARCHAR(255),
  phone VARCHAR(50),
  hire_date DATE,
  pay_type VARCHAR(50) DEFAULT 'salary' CHECK (pay_type IN ('salary','hourly','per_load','contract')),
  pay_rate NUMERIC(10,2),
  pay_period VARCHAR(50) DEFAULT 'monthly' CHECK (pay_period IN ('weekly','bi_weekly','monthly','per_load')),
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Staff payments log
CREATE TABLE IF NOT EXISTS staff_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  payment_date DATE,
  payment_method VARCHAR(100),
  notes TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
