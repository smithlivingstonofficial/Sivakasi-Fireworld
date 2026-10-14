-- ==============================================================================
-- COMPLETE DATABASE SETUP SCRIPT FOR SIVAKASI FIREWORLD (SUPABASE POSTGRESQL 15)
-- Source: public/products.csv (Complete 166-Product Sivakasi Catalog & 15 Categories)
-- Includes:
--   1. Extensions (uuid-ossp, pg_trgm, pgcrypto)
--   2. Custom Enums (order_status, movement_type)
--   3. All 12 Tables (store_settings, categories, products, inventory, inventory_movements,
--                    combos, combo_items, delivery_zones, orders, order_items, bills, bill_items)
--   4. Sequences & Stored Procedures (order_seq, next_order_number, reserve_order_inventory, bill_seq, next_bill_number)
--   5. High-Speed Trigram & Query Indexes
--   6. Full Row Level Security (RLS) Policies (Public Checkout, Admin Management & POS Billing)
--   7. Supabase Realtime Publication for Live Admin Sound & Order Alerts
--   8. Storage Bucket 'product-images' Setup & Object Policies
--   9. Admin User Auth Provisioning (marichamygis@gmail.com)
--  10. Complete Seed Data: 16 Store Settings, 3 Delivery Zones, 15 Categories,
--                          166 Products, 166 Inventory Balances, 2 Festival Combos
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ==============================================================================
-- 2. ENUM TYPES
-- ==============================================================================
DO $$ BEGIN
    CREATE TYPE order_status AS ENUM ('PENDING', 'CONFIRMED', 'PACKING', 'PACKED', 'DISPATCHED', 'DELIVERED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE movement_type AS ENUM ('PURCHASE', 'RESERVATION', 'SALE', 'CANCELLATION', 'DAMAGE', 'ADJUSTMENT');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ==============================================================================
-- 3. TABLES DEFINITION
-- ==============================================================================

-- 3.1 STORE SETTINGS TABLE
CREATE TABLE IF NOT EXISTS store_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.2 CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    icon_name VARCHAR(100),
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.3 PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    sku VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    pack_size VARCHAR(100),
    mrp DECIMAL(10, 2) NOT NULL CHECK (mrp >= 0),
    selling_price DECIMAL(10, 2) NOT NULL CHECK (selling_price >= 0),
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    is_best_seller BOOLEAN DEFAULT false,
    sound_level VARCHAR(50) DEFAULT 'Medium',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.4 INVENTORY TABLE
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID UNIQUE NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    available_stock INT NOT NULL DEFAULT 0 CHECK (available_stock >= 0),
    reserved_stock INT NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0),
    safety_threshold INT NOT NULL DEFAULT 10,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.5 INVENTORY MOVEMENTS AUDIT LOG
CREATE TABLE IF NOT EXISTS inventory_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type movement_type NOT NULL,
    quantity INT NOT NULL,
    reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3.6 COMBOS & COMBO ITEMS
CREATE TABLE IF NOT EXISTS combos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0),
    mrp DECIMAL(10, 2) NOT NULL CHECK (mrp >= 0),
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS combo_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    combo_id UUID NOT NULL REFERENCES combos(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INT NOT NULL CHECK (quantity > 0)
);

-- 3.7 DELIVERY ZONES
CREATE TABLE IF NOT EXISTS delivery_zones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    zone_name VARCHAR(100) NOT NULL,
    state_codes TEXT[] NOT NULL,
    min_order_amount DECIMAL(10, 2) NOT NULL DEFAULT 3000.00,
    delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    estimated_days VARCHAR(50) DEFAULT '2-3 Days',
    is_active BOOLEAN DEFAULT true
);

-- 3.8 ORDERS & ORDER ITEMS
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_mobile VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    shipping_address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    subtotal DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    delivery_fee DECIMAL(10, 2) DEFAULT 0,
    delivery_fee_set BOOLEAN DEFAULT false,
    grand_total DECIMAL(10, 2) NOT NULL,
    status order_status DEFAULT 'PENDING',
    admin_notes TEXT,
    courier_partner VARCHAR(100),
    tracking_number VARCHAR(100),
    estimated_delivery VARCHAR(50),
    is_paid BOOLEAN DEFAULT false,
    payment_method VARCHAR(50) DEFAULT 'COD',
    tags TEXT[] DEFAULT '{}',
    history JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    total_price DECIMAL(10, 2) NOT NULL,
    mrp DECIMAL(10, 2)
);
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS mrp DECIMAL(10, 2);

-- 3.9 BILLS & BILL ITEMS (COUNTER BILLING & POS)
CREATE TABLE IF NOT EXISTS bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_number VARCHAR(50) UNIQUE NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_mobile VARCHAR(20) NOT NULL,
    customer_email VARCHAR(255),
    shipping_address TEXT NOT NULL DEFAULT 'Direct Warehouse Pickup',
    city VARCHAR(100) NOT NULL DEFAULT 'Sivakasi',
    state VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu',
    pincode VARCHAR(20) NOT NULL DEFAULT '626123',
    subtotal DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0,
    delivery_fee DECIMAL(10, 2) DEFAULT 0,
    grand_total DECIMAL(10, 2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'CASH',
    is_paid BOOLEAN DEFAULT true,
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bill_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bill_id UUID NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    unit_price DECIMAL(10, 2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    total_price DECIMAL(10, 2) NOT NULL,
    pack_size VARCHAR(50),
    mrp DECIMAL(10, 2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE bill_items ADD COLUMN IF NOT EXISTS mrp DECIMAL(10, 2);

-- ==============================================================================
-- 4. HIGH-SPEED INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_products_search ON products USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_mobile ON orders(customer_mobile);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_city ON orders(city);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created ON inventory_movements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_bill_number ON bills(bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_customer_mobile ON bills(customer_mobile);
CREATE INDEX IF NOT EXISTS idx_bills_is_paid ON bills(is_paid);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_product_id ON bill_items(product_id);

-- ==============================================================================
-- 5. SEQUENCES & STORED PROCEDURES
-- ==============================================================================
CREATE SEQUENCE IF NOT EXISTS order_seq START 1001;

CREATE OR REPLACE FUNCTION next_order_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'VPP-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('order_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS bill_seq START 1001;

CREATE OR REPLACE FUNCTION next_bill_number()
RETURNS TEXT AS $$
BEGIN
  RETURN 'BILL-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('bill_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION reserve_order_inventory(
    p_items JSONB
) RETURNS BOOLEAN AS $$
DECLARE
    item RECORD;
    v_available INT;
BEGIN
    FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id UUID, quantity INT)
    LOOP
        SELECT available_stock INTO v_available 
        FROM inventory 
        WHERE product_id = item.product_id
        FOR UPDATE;

        IF v_available IS NULL OR v_available < item.quantity THEN
            RAISE EXCEPTION 'Insufficient stock for product %', item.product_id;
        END IF;

        UPDATE inventory 
        SET available_stock = available_stock - item.quantity,
            reserved_stock = reserved_stock + item.quantity
        WHERE product_id = item.product_id;

        INSERT INTO inventory_movements (product_id, type, quantity, reason)
        VALUES (item.product_id, 'RESERVATION', item.quantity, 'Order placement stock reservation');
    END LOOP;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE combos ENABLE ROW LEVEL SECURITY;
ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;

-- Clean existing policies to prevent conflicts on re-execution
DROP POLICY IF EXISTS "Public store_settings read" ON store_settings;
DROP POLICY IF EXISTS "Admin store_settings write" ON store_settings;
DROP POLICY IF EXISTS "Public categories read" ON categories;
DROP POLICY IF EXISTS "Admin categories full access" ON categories;
DROP POLICY IF EXISTS "Public products read" ON products;
DROP POLICY IF EXISTS "Admin products full access" ON products;
DROP POLICY IF EXISTS "Public inventory read" ON inventory;
DROP POLICY IF EXISTS "Admin inventory full access" ON inventory;
DROP POLICY IF EXISTS "Public inventory_movements read" ON inventory_movements;
DROP POLICY IF EXISTS "Admin inventory_movements full access" ON inventory_movements;
DROP POLICY IF EXISTS "Public combos read" ON combos;
DROP POLICY IF EXISTS "Admin combos full access" ON combos;
DROP POLICY IF EXISTS "Public combo_items read" ON combo_items;
DROP POLICY IF EXISTS "Admin combo_items full access" ON combo_items;
DROP POLICY IF EXISTS "Public delivery_zones read" ON delivery_zones;
DROP POLICY IF EXISTS "Admin delivery_zones write" ON delivery_zones;
DROP POLICY IF EXISTS "Public orders insert" ON orders;
DROP POLICY IF EXISTS "Public orders read own" ON orders;
DROP POLICY IF EXISTS "Admin orders full access" ON orders;
DROP POLICY IF EXISTS "Public order_items insert" ON order_items;
DROP POLICY IF EXISTS "Public order_items read" ON order_items;
DROP POLICY IF EXISTS "Admin order_items full access" ON order_items;
DROP POLICY IF EXISTS "Allow read bills" ON bills;
DROP POLICY IF EXISTS "Allow insert bills" ON bills;
DROP POLICY IF EXISTS "Allow update bills" ON bills;
DROP POLICY IF EXISTS "Allow delete bills" ON bills;
DROP POLICY IF EXISTS "Allow read bill_items" ON bill_items;
DROP POLICY IF EXISTS "Allow insert bill_items" ON bill_items;
DROP POLICY IF EXISTS "Allow update bill_items" ON bill_items;
DROP POLICY IF EXISTS "Allow delete bill_items" ON bill_items;

-- Storefront Public Read Policies
CREATE POLICY "Public store_settings read" ON store_settings FOR SELECT USING (true);
CREATE POLICY "Public categories read" ON categories FOR SELECT USING (is_active = true);
CREATE POLICY "Public products read" ON products FOR SELECT USING (is_active = true);
CREATE POLICY "Public inventory read" ON inventory FOR SELECT USING (true);
CREATE POLICY "Public inventory_movements read" ON inventory_movements FOR SELECT USING (true);
CREATE POLICY "Public combos read" ON combos FOR SELECT USING (is_active = true);
CREATE POLICY "Public combo_items read" ON combo_items FOR SELECT USING (true);
CREATE POLICY "Public delivery_zones read" ON delivery_zones FOR SELECT USING (true);

-- Checkout Public Order Placement Policies
CREATE POLICY "Public orders insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "Public orders read own" ON orders FOR SELECT USING (true);
CREATE POLICY "Public order_items insert" ON order_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Public order_items read" ON order_items FOR SELECT USING (true);

-- Authenticated Admin Management Policies
CREATE POLICY "Admin store_settings write" ON store_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin categories full access" ON categories FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin products full access" ON products FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin inventory full access" ON inventory FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin inventory_movements full access" ON inventory_movements FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin combos full access" ON combos FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin combo_items full access" ON combo_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin delivery_zones write" ON delivery_zones FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Admin orders full access" ON orders FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin order_items full access" ON order_items FOR ALL USING (auth.role() = 'authenticated');

-- POS Counter Billing Policies
CREATE POLICY "Allow read bills" ON bills FOR SELECT USING (true);
CREATE POLICY "Allow insert bills" ON bills FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update bills" ON bills FOR UPDATE USING (true);
CREATE POLICY "Allow delete bills" ON bills FOR DELETE USING (true);

CREATE POLICY "Allow read bill_items" ON bill_items FOR SELECT USING (true);
CREATE POLICY "Allow insert bill_items" ON bill_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update bill_items" ON bill_items FOR UPDATE USING (true);
CREATE POLICY "Allow delete bill_items" ON bill_items FOR DELETE USING (true);

-- ==============================================================================
-- 7. SUPABASE REALTIME REPLICATION PUBLICATION
-- ==============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
  END IF;
EXCEPTION
  WHEN undefined_object THEN null;
END $$;

ALTER TABLE orders REPLICA IDENTITY FULL;

-- ==============================================================================
-- 8. STORAGE BUCKET FOR PRODUCT IMAGES
-- ==============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-images',
  'product-images',
  true,
  10485760, -- 10MB limit per image
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic']
)
ON CONFLICT (id) DO UPDATE 
SET public = true, file_size_limit = 10485760;

DROP POLICY IF EXISTS "Allow public reads from product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to product-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from product-images" ON storage.objects;

CREATE POLICY "Allow public reads from product-images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

CREATE POLICY "Allow public uploads to product-images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Allow public updates to product-images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'product-images');

CREATE POLICY "Allow public deletes from product-images"
ON storage.objects FOR DELETE
TO public
USING (bucket_id = 'product-images');

-- ==============================================================================
-- 9. ADMIN USER AUTH SETUP (marichamygis@gmail.com)
-- ==============================================================================
DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  user_email TEXT := 'marichamygis@gmail.com';
  raw_password TEXT := 'SivakasiFireworld@2026!';   
  hashed_password TEXT;
BEGIN
  -- Generate bcrypt hash using pgcrypto extension
  hashed_password := extensions.crypt(raw_password, extensions.gen_salt('bf', 10));

  -- Clean up previous record if partially registered
  DELETE FROM auth.identities WHERE identity_data->>'email' = user_email OR provider_id = user_email;
  DELETE FROM auth.users WHERE email = user_email;

  -- Create authenticated admin user
  INSERT INTO auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id,
    'authenticated',
    'authenticated',
    user_email,
    hashed_password,
    NOW(),
    '{"provider": "email", "providers": ["email"]}'::jsonb,
    '{"full_name": "Sivakasi Fireworld Admin", "role": "admin"}'::jsonb,
    NOW(),
    NOW(),
    '',
    '',
    '',
    ''
  );

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  ) VALUES (
    gen_random_uuid(),
    new_user_id,
    format('{"sub":"%s","email":"%s"}', new_user_id, user_email)::jsonb,
    'email',
    user_email,
    NOW(),
    NOW(),
    NOW()
  );

  RAISE NOTICE 'Admin user % created successfully with ID %', user_email, new_user_id;
END $$;

-- ==============================================================================
-- 10. CATALOG & STORE DATA SEEDING
-- ==============================================================================

-- 10.1 CLEAN EXISTING CATALOG & TRANSACTIONAL DATA (RE-RUNNABLE SEED)
TRUNCATE TABLE 
  bill_items,
  bills,
  order_items, 
  orders, 
  combo_items, 
  combos, 
  inventory_movements, 
  inventory, 
  products, 
  categories,
  delivery_zones 
CASCADE;

-- 10.2 SEED STORE SETTINGS
INSERT INTO store_settings (key, value) VALUES
  ('store_name', 'Sivakasi Fireworld'),
  ('tagline', 'Sivakasi Direct Fireworks Outlet'),
  ('helpline_mobile', ''),
  ('whatsapp_number', ''),
  ('gstin', ''),
  ('announcement_banner', '⚡ DIWALI PRE-BOOKING OPEN: Get up to 80% OFF Factory Direct Rates!'),
  ('discount_percentage', '80'),
  ('store_address', ''),
  ('max_order_limit_enabled', 'false'),
  ('max_order_limit_amount', '50000'),
  ('min_order_tamil_nadu', '3000'),
  ('min_order_other_states', '5000'),
  ('state_min_order_overrides', '{}'),
  ('hero_banner_enabled', 'false'),
  ('hero_banner_image_url', ''),
  ('hero_banner_link_url', '#catalog')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- 10.3 SEED REGIONAL DELIVERY ZONES
INSERT INTO delivery_zones (id, zone_name, state_codes, min_order_amount, delivery_fee, estimated_days) VALUES 
  ('55555555-0000-0000-0000-000000000001', 'South India (Tamil Nadu, Kerala, Karnataka, AP, Telangana, Puducherry)', ARRAY['TN', 'Tamil Nadu', 'PY', 'KL', 'KA', 'AP', 'TS', 'Puducherry', 'Kerala', 'Karnataka', 'Andhra Pradesh', 'Telangana'], 4000.00, 150.00, '2-4 Days'),
  ('55555555-0000-0000-0000-000000000002', 'Rest of India', ARRAY['MH', 'DL', 'GJ', 'RJ', 'UP', 'WB', 'MP', 'HR', 'PB', 'ALL'], 5000.00, 250.00, '4-7 Days')
ON CONFLICT (id) DO UPDATE SET
  zone_name = EXCLUDED.zone_name,
  state_codes = EXCLUDED.state_codes,
  min_order_amount = EXCLUDED.min_order_amount,
  delivery_fee = EXCLUDED.delivery_fee,
  estimated_days = EXCLUDED.estimated_days;

-- 10.4 SEED 15 OFFICIAL SIVAKASI CATEGORIES
INSERT INTO categories (id, name, slug, description, icon_name, display_order, is_active) VALUES
  ('11111111-0000-0000-0000-000000000001', 'ONE SOUND CRACKERS', 'one-sound-crackers', 'Classic Single Sound Sivakasi Crackers', 'Volume2', 1, true),
  ('11111111-0000-0000-0000-000000000002', 'FLOWER POTS', 'flower-pots', 'Dazzling Sparkling Flower Pots Collection', 'Flame', 2, true),
  ('11111111-0000-0000-0000-000000000003', 'GROUND CHAKKAR', 'ground-chakkar', 'High Speed Spinning Ground Chakkaras', 'RotateCw', 3, true),
  ('11111111-0000-0000-0000-000000000004', 'TWINKLING STARS & PENCILS', 'twinkling-stars-pencils', 'Twinkling Stars & Colorful Sparkle Pencils', 'Sparkles', 4, true),
  ('11111111-0000-0000-0000-000000000005', 'ROCKETS', 'rockets', 'High Flying Sound and Whistling Sky Rockets', 'Rocket', 5, true),
  ('11111111-0000-0000-0000-000000000006', 'BOMBS', 'bombs', 'High Intensity Hydro, Deluxe & Paper Bombs', 'Volume2', 6, true),
  ('11111111-0000-0000-0000-000000000007', 'BIJILI CRACKERS', 'bijili-crackers', 'Traditional Red & Striped Bijili Crackers', 'Zap', 7, true),
  ('11111111-0000-0000-0000-000000000008', 'FOUNTAIN & VARIETIES', 'fountain-varieties', 'Colorful Fountains, Drones & Novelty Items', 'Sparkles', 8, true),
  ('11111111-0000-0000-0000-000000000009', 'FANCY CRACKERS', 'fancy-crackers', 'Spectacular Night Aerial Fancy Fireworks', 'Sparkles', 9, true),
  ('11111111-0000-0000-0000-000000000010', 'SILVER', 'silver', 'Premium Silver Celebration Fireworks Series', 'Sparkles', 10, true),
  ('11111111-0000-0000-0000-000000000011', 'GOLD', 'gold', 'Exclusive Gold Series Royal Sivakasi Fireworks', 'Sparkles', 11, true),
  ('11111111-0000-0000-0000-000000000012', 'WOW COLLECTION', 'wow-collection', 'Mega Multi-Shot Cakes & Sky Burst Showstoppers', 'Sparkles', 12, true),
  ('11111111-0000-0000-0000-000000000013', 'SPARKLERS', 'sparklers', 'Child-Safe Electric, Color & Mega Sparklers', 'Sparkles', 13, true),
  ('11111111-0000-0000-0000-000000000014', 'COLOUR MATCHES', 'colour-matches', 'Novelty Color Flame Matches & Safe Lights', 'Flame', 14, true),
  ('11111111-0000-0000-0000-000000000015', 'GIFT BOXES', 'gift-boxes', 'Grand Family Celebration & Kids Festival Gift Boxes', 'Gift', 15, true);

-- 10.5 SEED COMPLETE 166-PRODUCT OFFICIAL CATALOG (FROM public/products.csv)
INSERT INTO products (id, category_id, name, slug, sku, description, pack_size, mrp, selling_price, image_url, is_active, is_featured, is_best_seller, sound_level) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '2 3/4" Kuruvi', '2-34-kuruvi-id-001', 'ID-001', '2 3/4" Kuruvi - Authentic Sivakasi Fireworks.', '5 Pcs', 80.00, 16.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001', '3 1/2" Lakshmi', '3-12-lakshmi-id-002', 'ID-002', '3 1/2" Lakshmi - Authentic Sivakasi Fireworks.', '5 Pcs', 110.00, 22.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001', '4" Lakshmi', '4-lakshmi-id-003', 'ID-003', '4" Lakshmi - Authentic Sivakasi Fireworks.', '5 Pcs', 190.00, 38.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001', '4" Deluxe Lakshmi', '4-deluxe-lakshmi-id-004', 'ID-004', '4" Deluxe Lakshmi - Authentic Sivakasi Fireworks.', '5 Pcs', 250.00, 50.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001', '4" Gold Lakshmi', '4-gold-lakshmi-id-005', 'ID-005', '4" Gold Lakshmi - Authentic Sivakasi Fireworks.', '5 Pcs', 300.00, 60.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001', '5" Deluxe Lakshmi', '5-deluxe-lakshmi-id-006', 'ID-006', '5" Deluxe Lakshmi - Authentic Sivakasi Fireworks.', '5 Pcs', 430.00, 86.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001', '6" Deluxe Lakshmi/Jallikattu', '6-deluxe-lakshmijallikattu-id-007', 'ID-007', '6" Deluxe Lakshmi/Jallikattu - Authentic Sivakasi Fireworks.', '5 Pcs', 660.00, 132.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001', 'Two Sound Crackers', 'two-sound-crackers-id-008', 'ID-008', 'Two Sound Crackers - Authentic Sivakasi Fireworks.', '5 Pcs', 350.00, 70.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000009', '11111111-0000-0000-0000-000000000002', 'Flower Pots Special', 'flower-pots-special-id-009', 'ID-009', 'Flower Pots Special - Authentic Sivakasi Fireworks.', '10 Pcs', 800.00, 160.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000010', '11111111-0000-0000-0000-000000000002', 'Flower Pots Ashoka', 'flower-pots-ashoka-id-010', 'ID-010', 'Flower Pots Ashoka - Authentic Sivakasi Fireworks.', '10 Pcs', 1200.00, 240.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000011', '11111111-0000-0000-0000-000000000002', 'Flower Pots Deluxe', 'flower-pots-deluxe-id-011', 'ID-011', 'Flower Pots Deluxe - Authentic Sivakasi Fireworks.', '5 Pcs', 2200.00, 440.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000012', '11111111-0000-0000-0000-000000000002', 'Flower Pots Color Koti Dix', 'flower-pots-color-koti-dix-id-012', 'ID-012', 'Flower Pots Color Koti Dix - Authentic Sivakasi Fireworks.', '10 Pcs', 1900.00, 380.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000013', '11111111-0000-0000-0000-000000000003', 'Ground Chakkar Big', 'ground-chakkar-big-id-013', 'ID-013', 'Ground Chakkar Big - Authentic Sivakasi Fireworks.', '25 Pcs', 800.00, 160.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000014', '11111111-0000-0000-0000-000000000003', 'Ground Chakkar Big', 'ground-chakkar-big-id-014', 'ID-014', 'Ground Chakkar Big - Authentic Sivakasi Fireworks.', '10 Pcs', 400.00, 80.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000015', '11111111-0000-0000-0000-000000000003', 'Ground Chakkar Special', 'ground-chakkar-special-id-015', 'ID-015', 'Ground Chakkar Special - Authentic Sivakasi Fireworks.', '10 Pcs', 800.00, 160.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000016', '11111111-0000-0000-0000-000000000003', 'Ground Chakkar Deluxe', 'ground-chakkar-deluxe-id-016', 'ID-016', 'Ground Chakkar Deluxe - Authentic Sivakasi Fireworks.', '10 Pcs', 1400.00, 280.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000017', '11111111-0000-0000-0000-000000000003', 'Ground Chakkar Disco Wheel', 'ground-chakkar-disco-wheel-id-017', 'ID-017', 'Ground Chakkar Disco Wheel - Authentic Sivakasi Fireworks.', '5 Pcs', 1200.00, 240.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000018', '11111111-0000-0000-0000-000000000003', 'Wire Chakkar', 'wire-chakkar-id-018', 'ID-018', 'Wire Chakkar - Authentic Sivakasi Fireworks.', '10 Pcs', 1600.00, 320.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000019', '11111111-0000-0000-0000-000000000003', 'Moon Wheel', 'moon-wheel-id-019', 'ID-019', 'Moon Wheel - Authentic Sivakasi Fireworks.', '10 Pcs', 2000.00, 400.00, NULL, true, false, false, 'Low'),
  ('22222222-0000-0000-0000-000000000020', '11111111-0000-0000-0000-000000000004', '1 1/2" Twinkling Star', '1-12-twinkling-star-id-020', 'ID-020', '1 1/2" Twinkling Star - Authentic Sivakasi Fireworks.', '10 Pcs', 250.00, 50.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000021', '11111111-0000-0000-0000-000000000004', '4" Twinkling Star', '4-twinkling-star-id-021', 'ID-021', '4" Twinkling Star - Authentic Sivakasi Fireworks.', '10 Pcs', 700.00, 140.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000022', '11111111-0000-0000-0000-000000000004', '10" Pencil', '10-pencil-id-022', 'ID-022', '10" Pencil - Authentic Sivakasi Fireworks.', '10 Pcs', 400.00, 80.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000023', '11111111-0000-0000-0000-000000000004', '12" Pencil', '12-pencil-id-023', 'ID-023', '12" Pencil - Authentic Sivakasi Fireworks.', '10 Pcs', 530.00, 106.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000024', '11111111-0000-0000-0000-000000000004', '15" Pencil', '15-pencil-id-024', 'ID-024', '15" Pencil - Authentic Sivakasi Fireworks.', '10 Pcs', 800.00, 160.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000025', '11111111-0000-0000-0000-000000000004', '18" Pencil', '18-pencil-id-025', 'ID-025', '18" Pencil - Authentic Sivakasi Fireworks.', '10 Pcs', 900.00, 180.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000026', '11111111-0000-0000-0000-000000000005', 'Rocket Bomb/Colour Rocket', 'rocket-bombcolour-rocket-id-026', 'ID-026', 'Rocket Bomb/Colour Rocket - Authentic Sivakasi Fireworks.', '10 Pcs', 700.00, 140.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000027', '11111111-0000-0000-0000-000000000005', 'Whistling Rocket', 'whistling-rocket-id-027', 'ID-027', 'Whistling Rocket - Authentic Sivakasi Fireworks.', '10 Pcs', 1800.00, 360.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000028', '11111111-0000-0000-0000-000000000005', 'Lunik Rocket', 'lunik-rocket-id-028', 'ID-028', 'Lunik Rocket - Authentic Sivakasi Fireworks.', '10 Pcs', 1400.00, 280.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000029', '11111111-0000-0000-0000-000000000005', '2 Sound Rocket', '2-sound-rocket-id-029', 'ID-029', '2 Sound Rocket - Authentic Sivakasi Fireworks.', '10 Pcs', 1600.00, 320.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000030', '11111111-0000-0000-0000-000000000005', '3 Sound Rocket', '3-sound-rocket-id-030', 'ID-030', '3 Sound Rocket - Authentic Sivakasi Fireworks.', '10 Pcs', 1800.00, 360.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000031', '11111111-0000-0000-0000-000000000006', 'Bullet Bomb/Super Bullet', 'bullet-bombsuper-bullet-id-031', 'ID-031', 'Bullet Bomb/Super Bullet - Authentic Sivakasi Fireworks.', '10 Pcs', 300.00, 60.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000032', '11111111-0000-0000-0000-000000000006', 'Hydro Bomb', 'hydro-bomb-id-032', 'ID-032', 'Hydro Bomb - Authentic Sivakasi Fireworks.', '10 Pcs', 700.00, 140.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000033', '11111111-0000-0000-0000-000000000006', 'King Kong Bomb', 'king-kong-bomb-id-033', 'ID-033', 'King Kong Bomb - Authentic Sivakasi Fireworks.', '10 Pcs', 900.00, 180.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000034', '11111111-0000-0000-0000-000000000006', 'Classic Bomb', 'classic-bomb-id-034', 'ID-034', 'Classic Bomb - Authentic Sivakasi Fireworks.', '10 Pcs', 1200.00, 240.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000035', '11111111-0000-0000-0000-000000000006', 'Dinosaur Bomb', 'dinosaur-bomb-id-035', 'ID-035', 'Dinosaur Bomb - Authentic Sivakasi Fireworks.', '10 Pcs', 2200.00, 440.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000036', '11111111-0000-0000-0000-000000000006', 'Digital Bomb', 'digital-bomb-id-036', 'ID-036', 'Digital Bomb - Authentic Sivakasi Fireworks.', '10 Pcs', 2500.00, 500.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000037', '11111111-0000-0000-0000-000000000006', '555 Bomb', '555-bomb-id-037', 'ID-037', '555 Bomb - Authentic Sivakasi Fireworks.', '10 Pcs', 1600.00, 320.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000038', '11111111-0000-0000-0000-000000000006', '1/4 Kg Paper Bomb', '14-kg-paper-bomb-id-038', 'ID-038', '1/4 Kg Paper Bomb - Authentic Sivakasi Fireworks.', '1 Pce', 450.00, 90.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000039', '11111111-0000-0000-0000-000000000006', '1/2 Kg Paper Bomb', '12-kg-paper-bomb-id-039', 'ID-039', '1/2 Kg Paper Bomb - Authentic Sivakasi Fireworks.', '1 Pce', 900.00, 180.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000040', '11111111-0000-0000-0000-000000000006', '1 Kg Paper Bomb', '1-kg-paper-bomb-id-040', 'ID-040', '1 Kg Paper Bomb - Authentic Sivakasi Fireworks.', '1 Pce', 1800.00, 360.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000041', '11111111-0000-0000-0000-000000000007', 'Red Bijili', 'red-bijili-id-041', 'ID-041', 'Red Bijili - Authentic Sivakasi Fireworks.', '100 Pcs', 330.00, 66.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000042', '11111111-0000-0000-0000-000000000007', 'Stripped Bijili', 'stripped-bijili-id-042', 'ID-042', 'Stripped Bijili - Authentic Sivakasi Fireworks.', '100 Pcs', 350.00, 70.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000043', '11111111-0000-0000-0000-000000000008', 'Butterfly', 'butterfly-id-043', 'ID-043', 'Butterfly - Authentic Sivakasi Fireworks.', '10 Pcs', 900.00, 180.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000044', '11111111-0000-0000-0000-000000000008', 'Mega Siren', 'mega-siren-id-044', 'ID-044', 'Mega Siren - Authentic Sivakasi Fireworks.', '3 Pcs', 1800.00, 360.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000045', '11111111-0000-0000-0000-000000000008', 'Shower', 'shower-id-045', 'ID-045', 'Shower - Authentic Sivakasi Fireworks.', '5 Pcs', 1200.00, 240.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000046', '11111111-0000-0000-0000-000000000008', 'Tri Colour Fountain', 'tri-colour-fountain-id-046', 'ID-046', 'Tri Colour Fountain - Authentic Sivakasi Fireworks.', '5 Pcs', 2500.00, 500.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000047', '11111111-0000-0000-0000-000000000008', 'Kit Kat/Chit Phut/TitTak', 'kit-katchit-phuttittak-id-047', 'ID-047', 'Kit Kat/Chit Phut/TitTak - Authentic Sivakasi Fireworks.', '10 Pcs', 400.00, 80.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000048', '11111111-0000-0000-0000-000000000008', 'Photo Flash', 'photo-flash-id-048', 'ID-048', 'Photo Flash - Authentic Sivakasi Fireworks.', '5 Pcs', 700.00, 140.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000049', '11111111-0000-0000-0000-000000000008', 'Peacock', 'peacock-id-049', 'ID-049', 'Peacock - Authentic Sivakasi Fireworks.', '1 Pce', 1600.00, 320.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000050', '11111111-0000-0000-0000-000000000008', 'Helicopter', 'helicopter-id-050', 'ID-050', 'Helicopter - Authentic Sivakasi Fireworks.', '5 Pcs', 1000.00, 200.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000051', '11111111-0000-0000-0000-000000000008', 'Drone', 'drone-id-051', 'ID-051', 'Drone - Authentic Sivakasi Fireworks.', '5 Pcs', 1600.00, 320.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000052', '11111111-0000-0000-0000-000000000008', 'Tin Beer', 'tin-beer-id-052', 'ID-052', 'Tin Beer - Authentic Sivakasi Fireworks.', '1 Pce', 1200.00, 240.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000053', '11111111-0000-0000-0000-000000000008', 'Peacock Feather', 'peacock-feather-id-053', 'ID-053', 'Peacock Feather - Authentic Sivakasi Fireworks.', '5 Pcs', 1000.00, 200.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000054', '11111111-0000-0000-0000-000000000008', 'Golden Rain', 'golden-rain-id-054', 'ID-054', 'Golden Rain - Authentic Sivakasi Fireworks.', '5 Pcs', 1000.00, 200.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000055', '11111111-0000-0000-0000-000000000008', 'Crorepati / Jockpot', 'crorepati-jockpot-id-055', 'ID-055', 'Crorepati / Jockpot - Authentic Sivakasi Fireworks.', '2 Pcs', 2200.00, 440.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000056', '11111111-0000-0000-0000-000000000008', 'Rainbow Smoke', 'rainbow-smoke-id-056', 'ID-056', 'Rainbow Smoke - Authentic Sivakasi Fireworks.', '3 Pcs', 1500.00, 300.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000057', '11111111-0000-0000-0000-000000000008', 'Bambaram', 'bambaram-id-057', 'ID-057', 'Bambaram - Authentic Sivakasi Fireworks.', '10 Pcs', 1200.00, 240.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000058', '11111111-0000-0000-0000-000000000008', 'Black Money', 'black-money-id-058', 'ID-058', 'Black Money - Authentic Sivakasi Fireworks.', '5 Pcs', 2200.00, 440.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000059', '11111111-0000-0000-0000-000000000008', 'Lollipop (Stick)', 'lollipop-stick-id-059', 'ID-059', 'Lollipop (Stick) - Authentic Sivakasi Fireworks.', '5 Pcs', 1700.00, 340.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000060', '11111111-0000-0000-0000-000000000008', 'Pada Peacock', 'pada-peacock-id-060', 'ID-060', 'Pada Peacock - Authentic Sivakasi Fireworks.', '1 Pce', 4000.00, 800.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000061', '11111111-0000-0000-0000-000000000008', '90 Watts', '90-watts-id-061', 'ID-061', '90 Watts - Authentic Sivakasi Fireworks.', '3 Pcs', 1200.00, 240.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000062', '11111111-0000-0000-0000-000000000009', 'Chotta Fancy', 'chotta-fancy-id-062', 'ID-062', 'Chotta Fancy - Authentic Sivakasi Fireworks.', '1 Box', 400.00, 80.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000063', '11111111-0000-0000-0000-000000000009', '2" Pipe (5 Varieties)', '2-pipe-5-varieties-id-063', 'ID-063', '2" Pipe (5 Varieties) - Authentic Sivakasi Fireworks.', '1 Pce', 1200.00, 240.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000064', '11111111-0000-0000-0000-000000000009', '2" Pipe', '2-pipe-id-064', 'ID-064', '2" Pipe - Authentic Sivakasi Fireworks.', '3 Pcs', 2800.00, 560.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000065', '11111111-0000-0000-0000-000000000009', '3" Pipe (6 Varieties)', '3-pipe-6-varieties-id-065', 'ID-065', '3" Pipe (6 Varieties) - Authentic Sivakasi Fireworks.', '1 Pce', 2400.00, 480.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000066', '11111111-0000-0000-0000-000000000009', '3 1/2" Pipe (5 Varieties)', '3-12-pipe-5-varieties-id-066', 'ID-066', '3 1/2" Pipe (5 Varieties) - Authentic Sivakasi Fireworks.', '1 Pce', 3000.00, 600.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000067', '11111111-0000-0000-0000-000000000009', '4" Pipe (5 Varieties)', '4-pipe-5-varieties-id-067', 'ID-067', '4" Pipe (5 Varieties) - Authentic Sivakasi Fireworks.', '1 Pce', 3500.00, 700.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000068', '11111111-0000-0000-0000-000000000009', '4" Pipe NayagraFalls (Spl)', '4-pipe-nayagrafalls-spl-id-068', 'ID-068', '4" Pipe NayagraFalls (Spl) - Authentic Sivakasi Fireworks.', '1 Pce', 4000.00, 800.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000069', '11111111-0000-0000-0000-000000000009', '4" 7 Steps', '4-7-steps-id-069', 'ID-069', '4" 7 Steps - Authentic Sivakasi Fireworks.', '1 Pce', 4300.00, 860.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000070', '11111111-0000-0000-0000-000000000009', '4" 12 Steps', '4-12-steps-id-070', 'ID-070', '4" 12 Steps - Authentic Sivakasi Fireworks.', '1 Pce', 4800.00, 960.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000071', '11111111-0000-0000-0000-000000000009', '4" Pipe', '4-pipe-id-071', 'ID-071', '4" Pipe - Authentic Sivakasi Fireworks.', '2 Pcs', 9000.00, 1800.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000072', '11111111-0000-0000-0000-000000000009', '5" Pipe Orange', '5-pipe-orange-id-072', 'ID-072', '5" Pipe Orange - Authentic Sivakasi Fireworks.', '1 Pc', 5300.00, 1060.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000073', '11111111-0000-0000-0000-000000000009', '5" Pipe Lemon', '5-pipe-lemon-id-073', 'ID-073', '5" Pipe Lemon - Authentic Sivakasi Fireworks.', '1 Pc', 5300.00, 1060.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000074', '11111111-0000-0000-0000-000000000009', '5" Pipe Purble', '5-pipe-purble-id-074', 'ID-074', '5" Pipe Purble - Authentic Sivakasi Fireworks.', '1 Pc', 5300.00, 1060.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000075', '11111111-0000-0000-0000-000000000009', '5" Pipe', '5-pipe-id-075', 'ID-075', '5" Pipe - Authentic Sivakasi Fireworks.', '2 Pcs', 10000.00, 2000.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000076', '11111111-0000-0000-0000-000000000009', 'Cool Baby Cool', 'cool-baby-cool-id-076', 'ID-076', 'Cool Baby Cool - Authentic Sivakasi Fireworks.', '5 Pcs', 2000.00, 400.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000077', '11111111-0000-0000-0000-000000000009', '7 Shots Multicolour', '7-shots-multicolour-id-077', 'ID-077', '7 Shots Multicolour - Authentic Sivakasi Fireworks.', '5 Pcs', 1100.00, 220.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000078', '11111111-0000-0000-0000-000000000009', '12 Shots Rider / Crackling', '12-shots-rider-crackling-id-078', 'ID-078', '12 Shots Rider / Crackling - Authentic Sivakasi Fireworks.', '1 Box', 1400.00, 280.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000079', '11111111-0000-0000-0000-000000000009', '25 Shots Rider / Crackling', '25-shots-rider-crackling-id-079', 'ID-079', '25 Shots Rider / Crackling - Authentic Sivakasi Fireworks.', '1 Box', 2500.00, 500.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000080', '11111111-0000-0000-0000-000000000010', '30 Shots Multicolour', '30-shots-multicolour-id-080', 'ID-080', '30 Shots Multicolour - Authentic Sivakasi Fireworks.', '1 Box', 3500.00, 700.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000081', '11111111-0000-0000-0000-000000000010', '60 Shots Multicolour', '60-shots-multicolour-id-081', 'ID-081', '60 Shots Multicolour - Authentic Sivakasi Fireworks.', '1 Box', 7000.00, 1400.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000082', '11111111-0000-0000-0000-000000000010', '120 Shots Multicolour', '120-shots-multicolour-id-082', 'ID-082', '120 Shots Multicolour - Authentic Sivakasi Fireworks.', '1 Box', 14000.00, 2800.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000083', '11111111-0000-0000-0000-000000000011', '30 Shots Multicolour', '30-shots-multicolour-id-083', 'ID-083', '30 Shots Multicolour - Authentic Sivakasi Fireworks.', '1 Box', 4000.00, 800.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000084', '11111111-0000-0000-0000-000000000011', '60 Shots Multicolour', '60-shots-multicolour-id-084', 'ID-084', '60 Shots Multicolour - Authentic Sivakasi Fireworks.', '1 Box', 8000.00, 1600.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000085', '11111111-0000-0000-0000-000000000011', '120 Shots Multicolour', '120-shots-multicolour-id-085', 'ID-085', '120 Shots Multicolour - Authentic Sivakasi Fireworks.', '1 Box', 16000.00, 3200.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000086', '11111111-0000-0000-0000-000000000011', '240 Shots Multicolour', '240-shots-multicolour-id-086', 'ID-086', '240 Shots Multicolour - Authentic Sivakasi Fireworks.', '1 Box', 32000.00, 6400.00, NULL, true, false, false, 'High'),
  ('22222222-0000-0000-0000-000000000087', '11111111-0000-0000-0000-000000000012', 'Money Penny (Standard FW)', 'money-penny-standard-fw-id-087', 'ID-087', 'Money Penny (Standard FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 3550.00, 710.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000088', '11111111-0000-0000-0000-000000000012', 'Sun Drops (Standard FW)', 'sun-drops-standard-fw-id-088', 'ID-088', 'Sun Drops (Standard FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 3550.00, 710.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000089', '11111111-0000-0000-0000-000000000012', 'Twin Spin (Standard FW)', 'twin-spin-standard-fw-id-089', 'ID-089', 'Twin Spin (Standard FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 1550.00, 310.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000090', '11111111-0000-0000-0000-000000000012', 'Scarlet Saucer (Standard FW)', 'scarlet-saucer-standard-fw-id-090', 'ID-090', 'Scarlet Saucer (Standard FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 1550.00, 310.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000091', '11111111-0000-0000-0000-000000000012', 'Red & White Chakkar''s (Standard FW)', 'red-white-chakkars-standard-fw-id-091', 'ID-091', 'Red & White Chakkar''s (Standard FW) - Authentic Sivakasi Fireworks.', '10 Pcs', 880.00, 176.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000092', '11111111-0000-0000-0000-000000000012', 'Colour Burst (Standard FW)', 'colour-burst-standard-fw-id-092', 'ID-092', 'Colour Burst (Standard FW) - Authentic Sivakasi Fireworks.', '10 Pcs', 2440.00, 488.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000093', '11111111-0000-0000-0000-000000000012', 'Whistling Dixie (Vadivel FW)', 'whistling-dixie-vadivel-fw-id-093', 'ID-093', 'Whistling Dixie (Vadivel FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 1200.00, 240.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000094', '11111111-0000-0000-0000-000000000012', 'Ring Ring (Vadivel FW)', 'ring-ring-vadivel-fw-id-094', 'ID-094', 'Ring Ring (Vadivel FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 2000.00, 400.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000095', '11111111-0000-0000-0000-000000000012', 'Bad Boy (Vadivel FW)', 'bad-boy-vadivel-fw-id-095', 'ID-095', 'Bad Boy (Vadivel FW) - Authentic Sivakasi Fireworks.', '3 Pcs', 3300.00, 660.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000096', '11111111-0000-0000-0000-000000000012', 'Autumn Rain (Vadivel FW)', 'autumn-rain-vadivel-fw-id-096', 'ID-096', 'Autumn Rain (Vadivel FW) - Authentic Sivakasi Fireworks.', '1 Pce', 1400.00, 280.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000097', '11111111-0000-0000-0000-000000000012', 'Winter Rain (Vadivel FW)', 'winter-rain-vadivel-fw-id-097', 'ID-097', 'Winter Rain (Vadivel FW) - Authentic Sivakasi Fireworks.', '1 Pce', 1400.00, 280.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000098', '11111111-0000-0000-0000-000000000012', 'Scooby-Doo (Vadivel FW)', 'scooby-doo-vadivel-fw-id-098', 'ID-098', 'Scooby-Doo (Vadivel FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 1600.00, 320.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000099', '11111111-0000-0000-0000-000000000012', 'Dexter (Vadivel FW)', 'dexter-vadivel-fw-id-099', 'ID-099', 'Dexter (Vadivel FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 1600.00, 320.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000100', '11111111-0000-0000-0000-000000000012', 'Popeye (Vadivel FW)', 'popeye-vadivel-fw-id-100', 'ID-100', 'Popeye (Vadivel FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 1600.00, 320.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000101', '11111111-0000-0000-0000-000000000012', 'Power Puff Girls (Vadivel FW)', 'power-puff-girls-vadivel-fw-id-101', 'ID-101', 'Power Puff Girls (Vadivel FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 1600.00, 320.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000102', '11111111-0000-0000-0000-000000000012', 'Recycle (Vadivel FW)', 'recycle-vadivel-fw-id-102', 'ID-102', 'Recycle (Vadivel FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 2000.00, 400.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000103', '11111111-0000-0000-0000-000000000012', 'Fire Egg (Vadivel FW)', 'fire-egg-vadivel-fw-id-103', 'ID-103', 'Fire Egg (Vadivel FW) - Authentic Sivakasi Fireworks.', '2 Pcs', 1800.00, 360.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000104', '11111111-0000-0000-0000-000000000012', 'Rangoon (Ajantha FW)', 'rangoon-ajantha-fw-id-104', 'ID-104', 'Rangoon (Ajantha FW) - Authentic Sivakasi Fireworks.', '2 Pcs', 2500.00, 500.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000105', '11111111-0000-0000-0000-000000000012', 'Magical Sword (Ajantha FW)', 'magical-sword-ajantha-fw-id-105', 'ID-105', 'Magical Sword (Ajantha FW) - Authentic Sivakasi Fireworks.', '2 Pcs', 3200.00, 640.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000106', '11111111-0000-0000-0000-000000000012', 'Galaxy sword (Ajantha FW)', 'galaxy-sword-ajantha-fw-id-106', 'ID-106', 'Galaxy sword (Ajantha FW) - Authentic Sivakasi Fireworks.', '2 Pcs', 3200.00, 640.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000107', '11111111-0000-0000-0000-000000000012', 'Mitico (Ajantha FW)', 'mitico-ajantha-fw-id-107', 'ID-107', 'Mitico (Ajantha FW) - Authentic Sivakasi Fireworks.', '2 Pcs', 2200.00, 440.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000108', '11111111-0000-0000-0000-000000000012', 'Tropical Mushroom (Ajantha FW)', 'tropical-mushroom-ajantha-fw-id-108', 'ID-108', 'Tropical Mushroom (Ajantha FW) - Authentic Sivakasi Fireworks.', '1 Pc', 2500.00, 500.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000109', '11111111-0000-0000-0000-000000000012', 'Smiling Elephant (Ajantha FW)', 'smiling-elephant-ajantha-fw-id-109', 'ID-109', 'Smiling Elephant (Ajantha FW) - Authentic Sivakasi Fireworks.', '1 Pc', 3350.00, 670.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000110', '11111111-0000-0000-0000-000000000012', 'Lucky Lion (Ajantha FW)', 'lucky-lion-ajantha-fw-id-110', 'ID-110', 'Lucky Lion (Ajantha FW) - Authentic Sivakasi Fireworks.', '1 Pc', 3350.00, 670.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000111', '11111111-0000-0000-0000-000000000012', 'Lemon Tree (Ayyan FW)', 'lemon-tree-ayyan-fw-id-111', 'ID-111', 'Lemon Tree (Ayyan FW) - Authentic Sivakasi Fireworks.', '1 Pce', 1450.00, 290.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000112', '11111111-0000-0000-0000-000000000012', 'Cocktail (Ayyan FW)', 'cocktail-ayyan-fw-id-112', 'ID-112', 'Cocktail (Ayyan FW) - Authentic Sivakasi Fireworks.', '10 Pcs', 650.00, 130.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000113', '11111111-0000-0000-0000-000000000012', 'Jadugar (Ayyan FW)', 'jadugar-ayyan-fw-id-113', 'ID-113', 'Jadugar (Ayyan FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 3350.00, 670.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000114', '11111111-0000-0000-0000-000000000012', 'ManoRajan (Ayyan FW)', 'manorajan-ayyan-fw-id-114', 'ID-114', 'ManoRajan (Ayyan FW) - Authentic Sivakasi Fireworks.', '5 Pcs', 3350.00, 670.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000115', '11111111-0000-0000-0000-000000000012', 'Dix Pots', 'dix-pots-id-115', 'ID-115', 'Dix Pots - Authentic Sivakasi Fireworks.', '5 Pcs', 2500.00, 500.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000116', '11111111-0000-0000-0000-000000000012', 'Kit Kat (Red)', 'kit-kat-red-id-116', 'ID-116', 'Kit Kat (Red) - Authentic Sivakasi Fireworks.', '5 Pcs', 1750.00, 350.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000117', '11111111-0000-0000-0000-000000000012', 'Tic Tac Mint', 'tic-tac-mint-id-117', 'ID-117', 'Tic Tac Mint - Authentic Sivakasi Fireworks.', '5 Pcs', 1750.00, 350.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000118', '11111111-0000-0000-0000-000000000012', 'Milky Bar White', 'milky-bar-white-id-118', 'ID-118', 'Milky Bar White - Authentic Sivakasi Fireworks.', '5 Pcs', 1750.00, 350.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000119', '11111111-0000-0000-0000-000000000012', '5 Star Gold', '5-star-gold-id-119', 'ID-119', '5 Star Gold - Authentic Sivakasi Fireworks.', '5 Pcs', 1750.00, 350.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000120', '11111111-0000-0000-0000-000000000012', 'Dairy Milk', 'dairy-milk-id-120', 'ID-120', 'Dairy Milk - Authentic Sivakasi Fireworks.', '5 Pcs', 1750.00, 350.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000121', '11111111-0000-0000-0000-000000000012', 'Germs Colour Mix', 'germs-colour-mix-id-121', 'ID-121', 'Germs Colour Mix - Authentic Sivakasi Fireworks.', '5 Pcs', 1750.00, 350.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000122', '11111111-0000-0000-0000-000000000012', 'Karaoke Night', 'karaoke-night-id-122', 'ID-122', 'Karaoke Night - Authentic Sivakasi Fireworks.', '1 Pc', 1450.00, 290.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000123', '11111111-0000-0000-0000-000000000012', 'Jazz Music', 'jazz-music-id-123', 'ID-123', 'Jazz Music - Authentic Sivakasi Fireworks.', '1 Pc', 1650.00, 330.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000124', '11111111-0000-0000-0000-000000000012', 'Dr.Pepper', 'drpepper-id-124', 'ID-124', 'Dr.Pepper - Authentic Sivakasi Fireworks.', '1 Pc', 1650.00, 330.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000125', '11111111-0000-0000-0000-000000000012', 'Big Bang', 'big-bang-id-125', 'ID-125', 'Big Bang - Authentic Sivakasi Fireworks.', '1 Pc', 1650.00, 330.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000126', '11111111-0000-0000-0000-000000000012', 'Red Apple', 'red-apple-id-126', 'ID-126', 'Red Apple - Authentic Sivakasi Fireworks.', '5 Pcs', 1700.00, 340.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000127', '11111111-0000-0000-0000-000000000012', 'Carnival Fun Fait', 'carnival-fun-fait-id-127', 'ID-127', 'Carnival Fun Fait - Authentic Sivakasi Fireworks.', '5 Pcs', 1700.00, 340.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000128', '11111111-0000-0000-0000-000000000012', 'Mr.Big', 'mrbig-id-128', 'ID-128', 'Mr.Big - Authentic Sivakasi Fireworks.', '5 Pcs', 1700.00, 340.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000129', '11111111-0000-0000-0000-000000000012', 'Tooty Frootiy', 'tooty-frootiy-id-129', 'ID-129', 'Tooty Frootiy - Authentic Sivakasi Fireworks.', '5 Pcs', 1700.00, 340.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000130', '11111111-0000-0000-0000-000000000012', 'Bingo Music', 'bingo-music-id-130', 'ID-130', 'Bingo Music - Authentic Sivakasi Fireworks.', '5 Pcs', 1700.00, 340.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000131', '11111111-0000-0000-0000-000000000012', 'Party Time', 'party-time-id-131', 'ID-131', 'Party Time - Authentic Sivakasi Fireworks.', '5 Pcs', 1700.00, 340.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000132', '11111111-0000-0000-0000-000000000012', 'Kulfi', 'kulfi-id-132', 'ID-132', 'Kulfi - Authentic Sivakasi Fireworks.', '3 Pcs', 2450.00, 490.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000133', '11111111-0000-0000-0000-000000000012', 'Hot Cone', 'hot-cone-id-133', 'ID-133', 'Hot Cone - Authentic Sivakasi Fireworks.', '2 Pcs', 2200.00, 440.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000134', '11111111-0000-0000-0000-000000000012', 'King Version', 'king-version-id-134', 'ID-134', 'King Version - Authentic Sivakasi Fireworks.', '1 Pc', 2200.00, 440.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000135', '11111111-0000-0000-0000-000000000012', 'Cylinder Smoke', 'cylinder-smoke-id-135', 'ID-135', 'Cylinder Smoke - Authentic Sivakasi Fireworks.', '2 Pcs', 2555.00, 511.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000136', '11111111-0000-0000-0000-000000000013', '7 Cm Electric Sparklers', '7-cm-electric-sparklers-id-136', 'ID-136', '7 Cm Electric Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 90.00, 18.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000137', '11111111-0000-0000-0000-000000000013', '7 Cm Colour Sparklers', '7-cm-colour-sparklers-id-137', 'ID-137', '7 Cm Colour Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 110.00, 22.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000138', '11111111-0000-0000-0000-000000000013', '7 Cm Green Sparklers', '7-cm-green-sparklers-id-138', 'ID-138', '7 Cm Green Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 130.00, 26.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000139', '11111111-0000-0000-0000-000000000013', '10 Cm Electric Sparklers', '10-cm-electric-sparklers-id-139', 'ID-139', '10 Cm Electric Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 180.00, 36.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000140', '11111111-0000-0000-0000-000000000013', '10 Cm Colour Sparklers', '10-cm-colour-sparklers-id-140', 'ID-140', '10 Cm Colour Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 210.00, 42.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000141', '11111111-0000-0000-0000-000000000013', '10 Cm Green Sparklers', '10-cm-green-sparklers-id-141', 'ID-141', '10 Cm Green Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 240.00, 48.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000142', '11111111-0000-0000-0000-000000000013', '12 Cm Electric Sparklers', '12-cm-electric-sparklers-id-142', 'ID-142', '12 Cm Electric Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 270.00, 54.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000143', '11111111-0000-0000-0000-000000000013', '12 Cm Colour Sparklers', '12-cm-colour-sparklers-id-143', 'ID-143', '12 Cm Colour Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 300.00, 60.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000144', '11111111-0000-0000-0000-000000000013', '12 Cm Green Sparklers', '12-cm-green-sparklers-id-144', 'ID-144', '12 Cm Green Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 340.00, 68.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000145', '11111111-0000-0000-0000-000000000013', '15 Cm Electric Sparklers', '15-cm-electric-sparklers-id-145', 'ID-145', '15 Cm Electric Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 430.00, 86.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000146', '11111111-0000-0000-0000-000000000013', '15 Cm Colour Sparklers', '15-cm-colour-sparklers-id-146', 'ID-146', '15 Cm Colour Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 450.00, 90.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000147', '11111111-0000-0000-0000-000000000013', '15 Cm Green Sparklers', '15-cm-green-sparklers-id-147', 'ID-147', '15 Cm Green Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 470.00, 94.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000148', '11111111-0000-0000-0000-000000000013', '30 Cm Electric Sparklers', '30-cm-electric-sparklers-id-148', 'ID-148', '30 Cm Electric Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 430.00, 86.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000149', '11111111-0000-0000-0000-000000000013', '30 Cm Colour Sparklers', '30-cm-colour-sparklers-id-149', 'ID-149', '30 Cm Colour Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 450.00, 90.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000150', '11111111-0000-0000-0000-000000000013', '30 Cm Green Sparklers', '30-cm-green-sparklers-id-150', 'ID-150', '30 Cm Green Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 470.00, 94.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000151', '11111111-0000-0000-0000-000000000013', '50 Cm Electric Sparklers', '50-cm-electric-sparklers-id-151', 'ID-151', '50 Cm Electric Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 1600.00, 320.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000152', '11111111-0000-0000-0000-000000000013', '50 Cm Colour Sparklers', '50-cm-colour-sparklers-id-152', 'ID-152', '50 Cm Colour Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 1800.00, 360.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000153', '11111111-0000-0000-0000-000000000013', 'Rotating Umbrella Sparklers', 'rotating-umbrella-sparklers-id-153', 'ID-153', 'Rotating Umbrella Sparklers - Authentic Sivakasi Fireworks.', '1 Box', 2000.00, 400.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000154', '11111111-0000-0000-0000-000000000014', 'Colour Matches', 'colour-matches-id-154', 'ID-154', 'Colour Matches - Authentic Sivakasi Fireworks.', '1 Box', 1500.00, 300.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000155', '11111111-0000-0000-0000-000000000014', 'Colour Matches (Deluxe)', 'colour-matches-deluxe-id-155', 'ID-155', 'Colour Matches (Deluxe) - Authentic Sivakasi Fireworks.', '1 Box', 2000.00, 400.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000156', '11111111-0000-0000-0000-000000000014', 'Colour Matches 10 In 1(Big)', 'colour-matches-10-in-1big-id-156', 'ID-156', 'Colour Matches 10 In 1(Big) - Authentic Sivakasi Fireworks.', '1 Box', 2500.00, 500.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000157', '11111111-0000-0000-0000-000000000014', 'Hunter Gun(with) Ring Caps', 'hunter-gunwith-ring-caps-id-157', 'ID-157', 'Hunter Gun(with) Ring Caps - Authentic Sivakasi Fireworks.', '1 Box', 1500.00, 300.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000158', '11111111-0000-0000-0000-000000000014', 'Snake Serpent (Big)', 'snake-serpent-big-id-158', 'ID-158', 'Snake Serpent (Big) - Authentic Sivakasi Fireworks.', '1 Box', 1000.00, 200.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000159', '11111111-0000-0000-0000-000000000014', 'Electric Stone/Magic Pops', 'electric-stonemagic-pops-id-159', 'ID-159', 'Electric Stone/Magic Pops - Authentic Sivakasi Fireworks.', '1 Box', 100.00, 20.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000160', '11111111-0000-0000-0000-000000000014', 'Cartoon', 'cartoon-id-160', 'ID-160', 'Cartoon - Authentic Sivakasi Fireworks.', '25 Pcs', 700.00, 140.00, NULL, true, false, false, 'Silent'),
  ('22222222-0000-0000-0000-000000000161', '11111111-0000-0000-0000-000000000015', 'Darling Pack 20 Items', 'darling-pack-20-items-id-161', 'ID-161', 'Darling Pack 20 Items - Authentic Sivakasi Fireworks.', '1 Box', 330.00, 66.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000162', '11111111-0000-0000-0000-000000000015', 'Family Pack 25 Items', 'family-pack-25-items-id-162', 'ID-162', 'Family Pack 25 Items - Authentic Sivakasi Fireworks.', '1 Box', 400.00, 80.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000163', '11111111-0000-0000-0000-000000000015', 'Golden Pack 30 Items', 'golden-pack-30-items-id-163', 'ID-163', 'Golden Pack 30 Items - Authentic Sivakasi Fireworks.', '1 Box', 450.00, 90.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000164', '11111111-0000-0000-0000-000000000015', 'V.I.P. Pack 35 Items', 'vip-pack-35-items-id-164', 'ID-164', 'V.I.P. Pack 35 Items - Authentic Sivakasi Fireworks.', '1 Box', 530.00, 106.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000165', '11111111-0000-0000-0000-000000000015', 'Premium Pack 42 Items', 'premium-pack-42-items-id-165', 'ID-165', 'Premium Pack 42 Items - Authentic Sivakasi Fireworks.', '1 Box', 830.00, 166.00, NULL, true, false, false, 'Medium'),
  ('22222222-0000-0000-0000-000000000166', '11111111-0000-0000-0000-000000000015', 'Diwali Special Pack 50 Items', 'diwali-special-pack-50-items-id-166', 'ID-166', 'Diwali Special Pack 50 Items - Authentic Sivakasi Fireworks.', '1 Box', 1000.00, 200.00, NULL, true, false, false, 'Medium');

-- 10.6 SEED INITIAL WAREHOUSE INVENTORY BALANCES (150 STOCK FOR EACH PRODUCT)
INSERT INTO inventory (product_id, available_stock, reserved_stock, safety_threshold, updated_at) VALUES
  ('22222222-0000-0000-0000-000000000001', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000002', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000003', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000004', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000005', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000006', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000007', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000008', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000009', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000010', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000011', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000012', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000013', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000014', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000015', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000016', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000017', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000018', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000019', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000020', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000021', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000022', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000023', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000024', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000025', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000026', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000027', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000028', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000029', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000030', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000031', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000032', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000033', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000034', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000035', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000036', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000037', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000038', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000039', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000040', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000041', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000042', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000043', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000044', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000045', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000046', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000047', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000048', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000049', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000050', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000051', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000052', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000053', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000054', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000055', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000056', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000057', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000058', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000059', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000060', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000061', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000062', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000063', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000064', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000065', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000066', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000067', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000068', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000069', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000070', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000071', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000072', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000073', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000074', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000075', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000076', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000077', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000078', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000079', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000080', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000081', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000082', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000083', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000084', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000085', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000086', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000087', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000088', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000089', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000090', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000091', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000092', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000093', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000094', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000095', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000096', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000097', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000098', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000099', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000100', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000101', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000102', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000103', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000104', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000105', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000106', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000107', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000108', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000109', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000110', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000111', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000112', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000113', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000114', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000115', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000116', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000117', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000118', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000119', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000120', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000121', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000122', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000123', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000124', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000125', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000126', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000127', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000128', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000129', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000130', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000131', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000132', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000133', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000134', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000135', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000136', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000137', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000138', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000139', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000140', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000141', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000142', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000143', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000144', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000145', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000146', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000147', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000148', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000149', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000150', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000151', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000152', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000153', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000154', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000155', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000156', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000157', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000158', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000159', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000160', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000161', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000162', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000163', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000164', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000165', 150, 0, 10, NOW()),
  ('22222222-0000-0000-0000-000000000166', 150, 0, 10, NOW());

-- 10.7 SEED FESTIVAL COMBOS & BUNDLES
INSERT INTO combos (id, name, slug, description, price, mrp, image_url, is_active) VALUES
  ('44444444-0000-0000-0000-000000000001', 'Diwali Family Grand Celebration Pack', 'diwali-family-grand-celebration-pack', 'Complete 25-variety Sivakasi celebration gift box with sparklers, flower pots, rockets, and aerial shots.', 3990.00, 798.00, NULL, true),
  ('44444444-0000-0000-0000-000000000002', 'Kids Safe & Joyful Sparkle Box', 'kids-safe-joyful-sparkle-box', 'Child-safe low noise gift box with colorful sparklers, ground chakkaras, flower pots, and pencils.', 1890.00, 378.00, NULL, true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO combo_items (combo_id, product_id, quantity) VALUES
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 2),
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000009', 2),
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000013', 2),
  ('44444444-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000127', 3),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000009', 1),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000014', 2),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000020', 2),
  ('44444444-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000127', 3)
ON CONFLICT DO NOTHING;

-- 10.8 AUTOMATICALLY SYNCHRONIZE SELLING PRICES WITH GLOBAL STORE DISCOUNT
-- Ensures whenever discount_percentage is changed in store_settings, all product prices are instantly recalculated
CREATE OR REPLACE FUNCTION sync_product_prices_with_discount()
RETURNS TRIGGER AS $$
DECLARE
  v_discount NUMERIC;
BEGIN
  IF NEW.key = 'discount_percentage' THEN
    v_discount := COALESCE(NULLIF(NEW.value, '')::NUMERIC, 80);
    UPDATE products
    SET 
      selling_price = ROUND(mrp * ((100.0 - v_discount) / 100.0), 2),
      updated_at = NOW()
    WHERE mrp IS NOT NULL AND mrp > 0;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_discount_prices ON store_settings;
CREATE TRIGGER trg_sync_discount_prices
AFTER INSERT OR UPDATE OF value ON store_settings
FOR EACH ROW
WHEN (NEW.key = 'discount_percentage')
EXECUTE FUNCTION sync_product_prices_with_discount();

-- Immediate execution so seed products instantly match the configured discount percentage
DO $$
DECLARE
  v_discount NUMERIC := 80;
BEGIN
  SELECT COALESCE(NULLIF(value, '')::NUMERIC, 80) INTO v_discount
  FROM store_settings
  WHERE key = 'discount_percentage'
  LIMIT 1;

  UPDATE products
  SET 
    selling_price = ROUND(mrp * ((100.0 - v_discount) / 100.0), 2),
    updated_at = NOW()
  WHERE mrp IS NOT NULL AND mrp > 0;
END $$;

-- ==============================================================================
-- END OF COMPLETE DATABASE SETUP SCRIPT
-- ==============================================================================
