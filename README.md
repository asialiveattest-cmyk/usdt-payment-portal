# USDT Payment Portal

A standalone React/Vite payment page using Supabase. Public visitors can view the current USDT TRC20 address, amount and QR. Authorized admins can sign in and update settings.

## 1. Install and run locally

Install Node.js LTS, then in this folder:

```bash
npm install
cp .env.example .env
```

Edit `.env` with your Supabase project URL and publishable key, then:

```bash
npm run dev
```

## 2. Supabase setup

The database tables and policies were created in the SQL Editor in the guided setup:
- `public.payment_settings`
- `public.payment_admins`

Your admin user UID must be inserted into `payment_admins`.

### Create QR storage bucket

In Supabase Dashboard > Storage, create a bucket named `payment-assets` and set it to **Public bucket** so visitors can load the QR image.

Then run this SQL in Supabase SQL Editor:

```sql
create policy "Public can view payment QR"
on storage.objects
for select
to public
using (bucket_id = 'payment-assets');

create policy "Admins can upload payment QR"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'payment-assets'
  and auth.uid() in (
    select user_id from public.payment_admins
  )
);

create policy "Admins can update payment QR"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'payment-assets'
  and auth.uid() in (
    select user_id from public.payment_admins
  )
)
with check (
  bucket_id = 'payment-assets'
  and auth.uid() in (
    select user_id from public.payment_admins
  )
);

create policy "Admins can delete payment QR"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'payment-assets'
  and auth.uid() in (
    select user_id from public.payment_admins
  )
);
```

If a policy with the same name already exists, drop that policy first or use a different policy name.

## 3. Vercel deployment

1. Push this project to a new GitHub repository.
2. In Vercel choose Add New > Project and import the repository.
3. Add environment variables:
   - `VITE_SUPABASE_URL` = your Supabase Project URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase publishable key
4. Deploy. Vercel will provide a `*.vercel.app` public URL.

## Payment link behavior and safety

- The page does not initiate or verify blockchain transfers.
- Pay with Binance opens Binance's withdrawal entry point and copies the destination address.
- Binance does not document a public external-withdrawal deep link that automatically pre-fills both destination address and amount. Users must paste the copied address, select USDT and TRON (TRC20), and enter the displayed amount manually.
- Users must verify the destination, amount, token, network and fee inside Binance before confirming.
- Do not add a Supabase service-role key to frontend environment variables.
