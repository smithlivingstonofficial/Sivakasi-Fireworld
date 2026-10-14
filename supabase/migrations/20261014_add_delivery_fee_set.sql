-- Migration: Add delivery_fee_set column to orders
-- This flag tracks whether admin has explicitly set delivery charges for destination place

ALTER TABLE IF EXISTS orders 
ADD COLUMN IF NOT EXISTS delivery_fee_set BOOLEAN DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN orders.delivery_fee_set IS 'Flag indicating whether the admin has configured and approved the delivery freight for this order destination.';
