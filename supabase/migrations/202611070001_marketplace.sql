create extension if not exists pgcrypto;

create sequence if not exists public.marketplace_order_number_seq start 100001;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.create_marketplace_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_marketplace_profile on auth.users;
create trigger on_auth_user_created_marketplace_profile
  after insert on auth.users
  for each row execute procedure public.create_marketplace_profile();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 100),
  category text not null check (category in ('Clothing', 'Bags', 'Accessories')),
  price bigint not null check (price > 0),
  image_url text,
  description text not null default '',
  color text not null default '',
  stock integer not null default 0 check (stock >= 0),
  seller_name text not null,
  status text not null default 'active' check (status in ('active', 'hidden')),
  created_at timestamptz not null default now()
);

create table if not exists public.marketplace_settings (
  id integer primary key default 1 check (id = 1),
  bank_name text not null default '',
  account_name text not null default '',
  account_number text not null default '',
  delivery_fee bigint not null default 0 check (delivery_fee >= 0),
  updated_at timestamptz not null default now()
);

insert into public.marketplace_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('CT-' || lpad(nextval('public.marketplace_order_number_seq')::text, 6, '0')),
  customer_id uuid not null references public.profiles(id),
  customer_name text not null,
  customer_email text not null,
  phone text not null,
  delivery_address text not null,
  items_subtotal bigint not null check (items_subtotal >= 0),
  delivery_fee bigint not null check (delivery_fee >= 0),
  bank_name text not null,
  account_name text not null,
  account_number text not null,
  total bigint not null check (total >= 0),
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'awaiting_review', 'confirmed', 'rejected', 'expired')),
  proof_path text,
  hold_until timestamptz,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  product_image text,
  unit_price bigint not null check (unit_price > 0),
  quantity integer not null check (quantity > 0)
);

create table if not exists public.seller_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  seller_name text not null,
  item_name text not null check (length(item_name) between 1 and 100),
  category text not null check (category in ('Clothing', 'Bags', 'Accessories')),
  asking_price bigint not null check (asking_price > 0),
  size text not null,
  condition text not null check (condition in ('New with tags', 'Like new', 'Good')),
  description text not null default '',
  photo_paths text[] not null check (cardinality(photo_paths) between 1 and 5),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now()
);

create index if not exists products_active_created_idx on public.products (status, created_at desc);
create index if not exists orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index if not exists orders_status_created_idx on public.orders (status, created_at desc);
create index if not exists seller_submissions_user_created_idx on public.seller_submissions (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.marketplace_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.seller_submissions enable row level security;

create or replace function public.is_marketplace_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

grant execute on function public.is_marketplace_admin() to authenticated;

create policy "Profiles are visible to their owner and admins"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.is_marketplace_admin());

create policy "Active products are public"
  on public.products for select to anon, authenticated
  using (status = 'active' or public.is_marketplace_admin());
create policy "Admins manage products"
  on public.products for all to authenticated
  using (public.is_marketplace_admin())
  with check (public.is_marketplace_admin());

create policy "Customers can read transfer settings"
  on public.marketplace_settings for select to authenticated using (true);
create policy "Admins manage transfer settings"
  on public.marketplace_settings for update to authenticated
  using (public.is_marketplace_admin()) with check (public.is_marketplace_admin());

create policy "Customers can view their orders and admins can view all"
  on public.orders for select to authenticated
  using (customer_id = (select auth.uid()) or public.is_marketplace_admin());
create policy "Customers can view their order items and admins can view all"
  on public.order_items for select to authenticated
  using (
    public.is_marketplace_admin()
    or exists (
      select 1 from public.orders
      where orders.id = order_items.order_id and orders.customer_id = (select auth.uid())
    )
  );

create policy "Customers can view their submissions and admins can view all"
  on public.seller_submissions for select to authenticated
  using (user_id = (select auth.uid()) or public.is_marketplace_admin());
create policy "Customers can submit items for review"
  on public.seller_submissions for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending');
create policy "Admins can review seller submissions"
  on public.seller_submissions for update to authenticated
  using (public.is_marketplace_admin()) with check (public.is_marketplace_admin());

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;
grant select on public.marketplace_settings to authenticated;
grant update on public.marketplace_settings to authenticated;
grant select on public.profiles to authenticated;
grant select on public.orders, public.order_items to authenticated;
grant select, insert on public.seller_submissions to authenticated;
grant update on public.seller_submissions to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-images', 'product-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp']),
  ('payment-proofs', 'payment-proofs', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('seller-submissions', 'seller-submissions', false, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Public can view product images"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "Admins can manage product images"
  on storage.objects for all to authenticated
  using (bucket_id = 'product-images' and public.is_marketplace_admin())
  with check (bucket_id = 'product-images' and public.is_marketplace_admin());

create policy "Customers upload payment proof to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Customers and admins can read payment proof"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      public.is_marketplace_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );
create policy "Customers can delete unsubmitted payment proof"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.orders where orders.proof_path = name)
  );

create policy "Sellers upload item photos to their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'seller-submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Sellers and admins view submitted item photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'seller-submissions'
    and (
      public.is_marketplace_admin()
      or (storage.foldername(name))[1] = (select auth.uid())::text
    )
  );
create policy "Sellers delete unsubmitted item photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'seller-submissions'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.seller_submissions
      where storage.objects.name = any(seller_submissions.photo_paths)
    )
  );

create or replace function public.release_expired_marketplace_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_order record;
  item record;
  released_count integer := 0;
begin
  for expired_order in
    select id from public.orders
    where status = 'awaiting_payment' and hold_until <= now()
    for update skip locked
  loop
    for item in
      select product_id, quantity from public.order_items
      where order_id = expired_order.id and product_id is not null
    loop
      update public.products set stock = stock + item.quantity where id = item.product_id;
    end loop;
    update public.orders set status = 'expired', reviewed_at = now() where id = expired_order.id;
    released_count := released_count + 1;
  end loop;
  return released_count;
end;
$$;

create or replace function public.start_marketplace_order(
  p_delivery_address text,
  p_phone text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_profile public.profiles%rowtype;
  current_settings public.marketplace_settings%rowtype;
  requested_item record;
  current_product public.products%rowtype;
  new_order_id uuid;
  subtotal bigint := 0;
  item_count integer := 0;
begin
  if current_user_id is null then raise exception 'Sign in before placing an order'; end if;
  if length(trim(coalesce(p_delivery_address, ''))) < 8 then raise exception 'Enter a complete delivery address'; end if;
  if length(trim(coalesce(p_phone, ''))) < 7 then raise exception 'Enter a valid contact phone number'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Your shopping bag is empty'; end if;

  perform public.release_expired_marketplace_holds();
  select * into current_profile from public.profiles where id = current_user_id;
  select * into current_settings from public.marketplace_settings where id = 1;
  if length(trim(current_settings.account_number)) <> 10 then raise exception 'Valid bank transfer details are not configured'; end if;

  for requested_item in
    select product_id, quantity
    from jsonb_to_recordset(p_items) as line(product_id uuid, quantity integer)
  loop
    if requested_item.quantity is null or requested_item.quantity < 1 then raise exception 'Invalid item quantity'; end if;
    select * into current_product from public.products
      where id = requested_item.product_id and status = 'active'
      for update;
    if not found then raise exception 'A selected product is no longer available'; end if;
    if current_product.stock < requested_item.quantity then
      raise exception 'Not enough stock remaining for %', current_product.name;
    end if;
    update public.products set stock = stock - requested_item.quantity where id = current_product.id;
    subtotal := subtotal + current_product.price * requested_item.quantity;
    item_count := item_count + 1;
  end loop;

  if item_count = 0 then raise exception 'Your shopping bag is empty'; end if;

  insert into public.orders (
    customer_id, customer_name, customer_email, phone, delivery_address,
    items_subtotal, delivery_fee, bank_name, account_name, account_number, total, hold_until
  ) values (
    current_user_id, coalesce(current_profile.display_name, ''), coalesce(auth.jwt() ->> 'email', ''),
    trim(p_phone), trim(p_delivery_address), subtotal, current_settings.delivery_fee,
    current_settings.bank_name, current_settings.account_name, current_settings.account_number,
    subtotal + current_settings.delivery_fee, now() + interval '30 minutes'
  ) returning id into new_order_id;

  for requested_item in
    select product_id, quantity
    from jsonb_to_recordset(p_items) as line(product_id uuid, quantity integer)
  loop
    select * into current_product from public.products where id = requested_item.product_id;
    insert into public.order_items (order_id, product_id, product_name, product_image, unit_price, quantity)
    values (new_order_id, current_product.id, current_product.name, current_product.image_url, current_product.price, requested_item.quantity);
  end loop;

  return new_order_id;
end;
$$;

create or replace function public.submit_marketplace_payment_proof(p_order_id uuid, p_proof_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
  item record;
begin
  if auth.uid() is null then raise exception 'Sign in before submitting payment proof'; end if;
  if p_proof_path is null or split_part(p_proof_path, '/', 1) <> auth.uid()::text then
    raise exception 'Upload proof to your own account folder';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'payment-proofs'
      and name = p_proof_path
      and owner_id = auth.uid()::text
  ) then raise exception 'The uploaded payment proof could not be verified'; end if;

  select * into current_order from public.orders
    where id = p_order_id and customer_id = auth.uid()
    for update;
  if not found then raise exception 'Order not found'; end if;
  if current_order.status <> 'awaiting_payment' then raise exception 'This order is no longer waiting for payment'; end if;
  if current_order.hold_until <= now() then
    for item in select product_id, quantity from public.order_items where order_id = p_order_id and product_id is not null
    loop
      update public.products set stock = stock + item.quantity where id = item.product_id;
    end loop;
    update public.orders set status = 'expired', reviewed_at = now() where id = p_order_id;
    return false;
  end if;

  update public.orders
  set proof_path = p_proof_path, status = 'awaiting_review', hold_until = null
  where id = p_order_id;
  return true;
end;
$$;

create or replace function public.approve_seller_submission(p_submission_id uuid, p_image_url text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  submission public.seller_submissions%rowtype;
  new_product_id uuid;
begin
  if not public.is_marketplace_admin() then raise exception 'Administrator access is required'; end if;
  if p_image_url is null or p_image_url = '' then raise exception 'A published product image is required'; end if;
  select * into submission from public.seller_submissions
    where id = p_submission_id and status = 'pending'
    for update;
  if not found then raise exception 'This seller submission is no longer pending review'; end if;

  insert into public.products (
    name, category, price, image_url, description, color, stock, seller_name
  ) values (
    submission.item_name, submission.category, submission.asking_price, p_image_url,
    submission.description,
    concat('Size: ', submission.size, ' · ', submission.condition),
    1, submission.seller_name
  ) returning id into new_product_id;

  update public.seller_submissions set status = 'approved' where id = submission.id;
  return new_product_id;
end;
$$;

create or replace function public.review_marketplace_order(p_order_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
  item record;
begin
  if not public.is_marketplace_admin() then raise exception 'Administrator access is required'; end if;
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if current_order.status <> 'awaiting_review' then raise exception 'This order has already been reviewed'; end if;

  if p_confirm then
    update public.orders set status = 'confirmed', reviewed_at = now() where id = p_order_id;
  else
    for item in select product_id, quantity from public.order_items where order_id = p_order_id and product_id is not null
    loop
      update public.products set stock = stock + item.quantity where id = item.product_id;
    end loop;
    update public.orders set status = 'rejected', reviewed_at = now() where id = p_order_id;
  end if;
end;
$$;

revoke all on function public.start_marketplace_order(text, text, jsonb) from public, anon;
grant execute on function public.start_marketplace_order(text, text, jsonb) to authenticated;
revoke all on function public.submit_marketplace_payment_proof(uuid, text) from public, anon;
grant execute on function public.submit_marketplace_payment_proof(uuid, text) to authenticated;
revoke all on function public.release_expired_marketplace_holds() from public, anon;
grant execute on function public.release_expired_marketplace_holds() to authenticated;
revoke all on function public.review_marketplace_order(uuid, boolean) from public, anon;
grant execute on function public.review_marketplace_order(uuid, boolean) to authenticated;
revoke all on function public.approve_seller_submission(uuid, text) from public, anon;
grant execute on function public.approve_seller_submission(uuid, text) to authenticated;

alter table public.orders replica identity full;
alter publication supabase_realtime add table public.orders;
