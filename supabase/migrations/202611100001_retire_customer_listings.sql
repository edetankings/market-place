drop policy if exists "Customers can view their submissions and admins can view all"
  on public.seller_submissions;
drop policy if exists "Customers can submit items for review"
  on public.seller_submissions;
drop policy if exists "Admins can review seller submissions"
  on public.seller_submissions;

revoke all on table public.seller_submissions from anon, authenticated;

drop policy if exists "Sellers upload item photos to their own folder"
  on storage.objects;
drop policy if exists "Sellers and admins view submitted item photos"
  on storage.objects;
drop policy if exists "Sellers delete unsubmitted item photos"
  on storage.objects;

drop function if exists public.approve_seller_submission(uuid, text);
