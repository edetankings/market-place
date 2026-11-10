# Common Thread

A React + TypeScript clothes marketplace. Customer accounts, catalog, orders, stock and payment-proof files are backed by Supabase. Product listings are managed by an administrator. Checkout uses admin-configured manual bank transfer. It is not configured for live use until the deployment setup below is complete.

## Local setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project API settings. The browser only uses the publishable/anon key; never put a service-role key in a `VITE_` variable.
3. Run the SQL migrations in `supabase/migrations` in filename order. They create the schema, access policies, upload buckets and server-side order functions, and retire customer-submitted product listings.
4. Start the app:

   ```sh
   npm install
   npm run dev
   ```

5. Register your own customer account. To grant the first administrator role, run this once in the Supabase SQL editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'owner@example.com');
   ```

   Sign in at `/admin/login`, add the real transfer account and delivery fee, then add products and stock from the admin desk.

## Marketplace pages

- `/` — published products, search and categories.
- `/auth` — customer account registration and sign-in.
- `/products/:productId` — product detail.
- `/cart` and `/checkout` — cart, delivery location, bank details and proof upload. The server calculates totals and reserves inventory atomically.
- `/account` and `/orders/:orderId` — customer order history, status and final receipt.
- `/admin/login` and `/admin` — administrator-only product listings, inventory, transfer settings and payment review.

The initial delivery fee is a single marketplace-wide charge. If delivery pricing varies by location, extend the settings and checkout to use a server-managed delivery-zone table before launch.

## Payment and notifications

Admin confirms a transfer from the protected payment-proof bucket. Confirmation marks the order paid and makes the customer receipt available in their account. Rejection releases the reserved item quantities. Customers can see order status and receipts in the site; email notifications were intentionally not added.

Configure Supabase Auth email confirmation, SMTP, password recovery and the production redirect URLs in the Supabase dashboard. Keep database permissions and storage private; do not expose service-role credentials to the browser.
