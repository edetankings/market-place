create unique index if not exists profiles_single_marketplace_admin_idx
  on public.profiles (role)
  where role = 'admin';
