-- Add card_last3 column to fuel_purchases for fuel card tracking
ALTER TABLE fuel_purchases ADD COLUMN IF NOT EXISTS card_last3 VARCHAR(3);

-- Create fuel_cards table to store known card mappings per truck
CREATE TABLE IF NOT EXISTS fuel_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id UUID REFERENCES trucks(id) ON DELETE CASCADE,
  card_last3 VARCHAR(3) NOT NULL,
  card_holder VARCHAR(255),
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update existing fuel logs with card info based on truck assignment
-- These will be populated via the API after trucks are identified by unit_number
