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

-- Note: Ensure Row Level Security (RLS) is configured appropriately if testing in production.
-- For local development with anon key, you may need to enable RLS and add policies, or disable RLS temporarily.
-- Example to allow anonymous access (for testing only!):
-- ALTER TABLE vibe_profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE session_logs DISABLE ROW LEVEL SECURITY;
