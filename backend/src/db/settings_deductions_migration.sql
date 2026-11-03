-- ============================================================
-- MIGRATION: Add deduction defaults + frequency tracking to company_settings
-- Run once against your Neon/PostgreSQL database
-- ============================================================

ALTER TABLE company_settings
  ADD COLUMN IF NOT EXISTS eld_fee_weekly       NUMERIC(10,2) DEFAULT 35.00,
  ADD COLUMN IF NOT EXISTS insurance_monthly    NUMERIC(10,2) DEFAULT 2000.00,
  ADD COLUMN IF NOT EXISTS trailer_payment_monthly NUMERIC(10,2) DEFAULT 600.00,
  ADD COLUMN IF NOT EXISTS dispatch_fee_pct     NUMERIC(5,2)  DEFAULT 4.00,
  ADD COLUMN IF NOT EXISTS office_authority_pct NUMERIC(5,2)  DEFAULT 12.00,
  ADD COLUMN IF NOT EXISTS driver_pay_default_pct NUMERIC(5,2) DEFAULT 30.00;

-- deduction_templates: add frequency field
ALTER TABLE deduction_templates
  ADD COLUMN IF NOT EXISTS frequency VARCHAR(30) DEFAULT 'weekly'
    CHECK (frequency IN ('weekly','twice_monthly','monthly','per_load','percentage'));
