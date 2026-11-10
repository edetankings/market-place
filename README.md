# Common Thread

A React + TypeScript clothes marketplace with a customer catalog, cart, checkout, account area and administrator-managed inventory.

## Explore without connecting a backend

The app opens on the account creation screen when no backend environment is configured. Enter a name and email to open the local preview.

The preview includes 12 sample products across clothing, bags and accessories. You can search and sort the catalog, add items to your bag, try checkout, place a sample order, view its receipt and edit account details. Preview profile and order data are stored only in the current browser. No real account is created, payment is taken or delivery booked.

Start the preview locally:

```sh
npm install
npm run dev
```

## Connect the live marketplace

1. Create a project and copy `.env.example` to `.env.local`.
2. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. Use only the publishable/anon key in the browser; never expose a service-role key.
3. Run the SQL migrations in `supabase/migrations` in filename order in the project SQL editor.
4. Start the app with `npm run dev`. With the environment configured, customer signup, inventory, orders and payment-proof uploads use the live backend instead of preview data.
5. Register the owner account, then grant it administrator access in the SQL editor. At most one account can have the administrator role; demote any existing administrator before applying the migration if you are changing owners:

   ```sql
   update public.profiles
   set role = 'admin'
   where id = (select id from auth.users where email = 'owner@example.com');
   ```

6. Sign in at `/admin/login`; set the transfer account and delivery fee, then add products and stock from the admin desk.

Configure authentication email confirmation, password recovery, SMTP and allowed redirect URLs before launch. The production database migration also removes customer listing submissions; only administrators manage product listings.

## Main routes

- `/` — searchable, filterable product catalog.
- `/auth` — customer account registration and sign-in; local preview entry when no live environment is configured.
- `/products/:productId` — product details.
- `/cart` and `/checkout` — cart, delivery location and payment-proof submission for live orders; local sample-order flow in preview mode.
- `/account` and `/orders/:orderId` — customer details, order history and receipts.
- `/admin/login` and `/admin` — administrator-only product, stock, transfer and payment management.

## Payment flow

Live checkout uses admin-configured manual bank transfer. The app reserves stock, collects proof of payment, and makes a receipt available after administrator confirmation. Email notifications are not currently configured.
