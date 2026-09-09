-- Admin role + real (backend-tracked) subscription state on users.
-- premium_until NULL (or in the past) means not premium; a future timestamp
-- means premium until then. Setting it is admin-only for now — see
-- modules/admin/. Not yet enforced anywhere as a paywall gate; that's a
-- separate follow-up, this just gives the admin a real value to set.
ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN premium_until TIMESTAMPTZ;
