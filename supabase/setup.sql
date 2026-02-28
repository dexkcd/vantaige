-- Create the vibe_profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS vibe_profiles (
  id text PRIMARY KEY,
  brand_identity text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the session_logs table
CREATE TABLE IF NOT EXISTS session_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id text REFERENCES vibe_profiles(id) ON DELETE CASCADE,
  summary text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the marketing_plans table for the Kanban Bridge
CREATE TABLE IF NOT EXISTS marketing_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id text REFERENCES vibe_profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  platform text,
  priority text DEFAULT 'medium',
  description text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create the brand_assets table for persisting generated images
CREATE TABLE IF NOT EXISTS brand_assets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  brand_id text REFERENCES vibe_profiles(id) ON DELETE CASCADE,
  prompt text NOT NULL,
  image_url text,
  status text DEFAULT 'generating',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note: Ensure Row Level Security (RLS) is configured appropriately if testing in production.
-- For local development with anon key, you may need to enable RLS and add policies, or disable RLS temporarily.
-- Example to allow anonymous access (for testing only!):
-- ALTER TABLE vibe_profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE session_logs DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE marketing_plans DISABLE ROW LEVEL SECURITY;
