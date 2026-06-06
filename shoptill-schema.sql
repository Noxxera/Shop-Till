-- =====================================================================
--  ShopTill — Supabase database schema, roles & business logic
--  Run this whole file once in: Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. PROFILES  (one row per user, linked to Supabase Auth, holds the role)
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  role       text not null default 'employee' check (role in ('owner','employee')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile whenever someone signs up.
-- The VERY FIRST user to sign up becomes the owner; everyone after = employee.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
declare user_count int;
begin
  select count(*) into user_count from public.profiles;
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
    case when user_count = 0 then 'owner' else 'employee' end
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper: the current user's role. SECURITY DEFINER so it can read profiles
-- without tripping over the profiles RLS policy (avoids infinite recursion).
create or replace function public.auth_role()
returns text
language sql security definer set search_path = public stable as $$
  select role from public.profiles where id = auth.uid();
$$;


-- ---------------------------------------------------------------------
-- 2. PRODUCTS  (cost_price lives here — base table is owner-only)
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  category   text default 'General',
  supplier   text default '',
  cost_price numeric(12,2) not null default 0,
  sell_price numeric(12,2) not null default 0,
  stock      int  not null default 0,
  low_alert  int  not null default 5,
  barcode    text default '',
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 3. CUSTOMERS
-- ---------------------------------------------------------------------
create table if not exists public.customers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text default '',
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 4. SALES  (client_id = device-generated id; makes offline retries safe)
-- ---------------------------------------------------------------------
create table if not exists public.sales (
  id         uuid primary key default gen_random_uuid(),
  client_id  text unique,
  cashier_id uuid references public.profiles(id),
  customer   text default '',
  subtotal   numeric(12,2) not null default 0,
  discount   numeric(12,2) not null default 0,
  vat        numeric(12,2) not null default 0,
  total      numeric(12,2) not null default 0,
  refunded   boolean not null default false,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 5. SALE ITEMS  (the individual lines of each sale)
-- ---------------------------------------------------------------------
create table if not exists public.sale_items (
  id         uuid primary key default gen_random_uuid(),
  sale_id    uuid references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  name       text not null,
  qty        int  not null,
  unit_price numeric(12,2) not null,
  unit_cost  numeric(12,2) not null default 0
);


-- ---------------------------------------------------------------------
-- 6. STOCK MOVEMENTS  (audit trail: every +/- to stock is logged)
-- ---------------------------------------------------------------------
create table if not exists public.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id),
  change     int  not null,           -- negative = sold, positive = restock/refund
  reason     text not null,           -- 'sale' | 'restock' | 'refund' | 'adjust'
  ref_id     text,                    -- related sale client_id, or a note
  created_at timestamptz not null default now()
);


-- =====================================================================
--  BUSINESS LOGIC  (functions run with elevated rights, role-checked inside)
-- =====================================================================

-- Record a sale atomically. IDEMPOTENT on client_id: if the same sale is sent
-- twice (e.g. flaky network retry), the second call just returns the first id.
--   p_items example: [{"product_id":"<uuid>","qty":2}, {"product_id":"<uuid>","qty":1}]
--   p_vat_rate is a percent, e.g. 16 for 16%.
create or replace function public.record_sale(
  p_client_id text,
  p_customer  text,
  p_discount  numeric,
  p_vat_rate  numeric,
  p_items     jsonb
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid;
  v_sub  numeric := 0;
  v_disc numeric := coalesce(p_discount, 0);
  v_vat  numeric := 0;
  v_total numeric := 0;
  item jsonb;
  v_prod public.products;
  v_qty int;
begin
  -- already recorded? return the existing sale, do nothing else
  select id into v_sale_id from public.sales where client_id = p_client_id;
  if found then return v_sale_id; end if;

  -- price the cart from CURRENT prices + verify stock (lock the rows)
  for item in select e.value from jsonb_array_elements(p_items) e loop
    v_qty := (item->>'qty')::int;
    select * into v_prod from public.products
      where id = (item->>'product_id')::uuid for update;
    if not found then raise exception 'Product not found'; end if;
    if v_prod.stock < v_qty then
      raise exception 'Not enough stock for %', v_prod.name;
    end if;
    v_sub := v_sub + v_prod.sell_price * v_qty;
  end loop;

  if v_disc > v_sub then v_disc := v_sub; end if;
  v_vat   := round((v_sub - v_disc) * coalesce(p_vat_rate, 0) / 100, 2);
  v_total := v_sub - v_disc + v_vat;

  insert into public.sales (client_id, cashier_id, customer, subtotal, discount, vat, total)
  values (p_client_id, auth.uid(), coalesce(p_customer,''), v_sub, v_disc, v_vat, v_total)
  returning id into v_sale_id;

  -- write line items, decrement stock, log movements
  for item in select e.value from jsonb_array_elements(p_items) e loop
    v_qty := (item->>'qty')::int;
    select * into v_prod from public.products where id = (item->>'product_id')::uuid;
    insert into public.sale_items (sale_id, product_id, name, qty, unit_price, unit_cost)
    values (v_sale_id, v_prod.id, v_prod.name, v_qty, v_prod.sell_price, v_prod.cost_price);
    update public.products set stock = stock - v_qty where id = v_prod.id;
    insert into public.stock_movements (product_id, change, reason, ref_id)
    values (v_prod.id, -v_qty, 'sale', p_client_id);
  end loop;

  return v_sale_id;
end; $$;

-- Restock a product (OWNER ONLY)
create or replace function public.restock(p_product_id uuid, p_qty int)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.auth_role() <> 'owner' then raise exception 'Owner access only'; end if;
  update public.products set stock = stock + p_qty where id = p_product_id;
  insert into public.stock_movements (product_id, change, reason)
  values (p_product_id, p_qty, 'restock');
end; $$;

-- Refund a sale (OWNER ONLY): restores stock, marks the sale refunded
create or replace function public.refund_sale(p_sale_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare it public.sale_items;
begin
  if public.auth_role() <> 'owner' then raise exception 'Owner access only'; end if;
  update public.sales set refunded = true where id = p_sale_id and refunded = false;
  if not found then return; end if;
  for it in select * from public.sale_items where sale_id = p_sale_id loop
    update public.products set stock = stock + it.qty where id = it.product_id;
    insert into public.stock_movements (product_id, change, reason, ref_id)
    values (it.product_id, it.qty, 'refund', p_sale_id::text);
  end loop;
end; $$;


-- ---------------------------------------------------------------------
--  EMPLOYEE PRODUCT VIEW  (same products, but WITHOUT cost_price)
--  Employees read this; the cost price never leaves the server for them.
-- ---------------------------------------------------------------------
create or replace view public.products_sale
with (security_invoker = false) as
  select id, name, category, sell_price, stock, low_alert, barcode, created_at
  from public.products;


-- =====================================================================
--  ROW LEVEL SECURITY + POLICIES
-- =====================================================================
alter table public.profiles        enable row level security;
alter table public.products        enable row level security;
alter table public.customers       enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.stock_movements enable row level security;

-- PROFILES: read your own (owner reads all); only owner can change roles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (id = auth.uid() or public.auth_role() = 'owner');
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
  for update using (public.auth_role() = 'owner');

-- PRODUCTS: only the owner can read/add/edit/delete the base table (it holds cost)
drop policy if exists products_owner_all on public.products;
create policy products_owner_all on public.products
  for all using (public.auth_role() = 'owner')
  with check (public.auth_role() = 'owner');

-- CUSTOMERS: any signed-in user can read + add
drop policy if exists customers_read on public.customers;
create policy customers_read on public.customers
  for select using (auth.uid() is not null);
drop policy if exists customers_insert on public.customers;
create policy customers_insert on public.customers
  for insert with check (auth.uid() is not null);

-- SALES: owner sees all; employee sees only their own (inserts go via record_sale)
drop policy if exists sales_select on public.sales;
create policy sales_select on public.sales
  for select using (public.auth_role() = 'owner' or cashier_id = auth.uid());

-- SALE ITEMS: visible only if you can see the parent sale
drop policy if exists sale_items_select on public.sale_items;
create policy sale_items_select on public.sale_items
  for select using (
    exists (select 1 from public.sales s
            where s.id = sale_items.sale_id
              and (public.auth_role() = 'owner' or s.cashier_id = auth.uid()))
  );

-- STOCK MOVEMENTS: owner only (full audit trail)
drop policy if exists movements_owner on public.stock_movements;
create policy movements_owner on public.stock_movements
  for select using (public.auth_role() = 'owner');


-- =====================================================================
--  GRANTS  (PostgREST needs these; RLS above still controls the rows)
-- =====================================================================
grant usage on schema public to authenticated;

grant select, insert, update, delete on public.products  to authenticated;  -- gated to owner by RLS
grant select, insert                 on public.customers to authenticated;
grant select                         on public.sales      to authenticated;
grant select                         on public.sale_items to authenticated;
grant select                         on public.stock_movements to authenticated;
grant select, update                 on public.profiles   to authenticated;
grant select                         on public.products_sale to authenticated;

grant execute on function public.record_sale(text,text,numeric,numeric,jsonb) to authenticated;
grant execute on function public.restock(uuid,int)        to authenticated;
grant execute on function public.refund_sale(uuid)        to authenticated;
grant execute on function public.auth_role()              to authenticated;

-- =====================================================================
--  DONE.  Next: create the OWNER account first (sign-up or dashboard),
--  then the employee. First user automatically becomes the owner.
-- =====================================================================
