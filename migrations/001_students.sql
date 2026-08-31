-- Students provisioned in the admin app, later linked to Neon Auth logins.
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  neon_user_id UUID UNIQUE,
  invited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE students ADD COLUMN IF NOT EXISTS neon_user_id UUID;
ALTER TABLE students ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;
ALTER TABLE students ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS students_email_lower_idx
  ON students (lower(email));

CREATE UNIQUE INDEX IF NOT EXISTS students_neon_user_id_idx
  ON students (neon_user_id)
  WHERE neon_user_id IS NOT NULL;
