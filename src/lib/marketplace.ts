export type Category = 'Clothing' | 'Bags' | 'Accessories'
export type UserRole = 'customer' | 'admin'
export type Product = {
  id: string
  name: string
  category: Category
  price: number
  image_url: string | null
  description: string
  color: string
  stock: number
  seller_name: string
  status: 'active' | 'hidden'
  created_at: string
}
export type OrderItem = {
  id: string
  product_id: string
  product_name: string
  product_image: string | null
  unit_price: number
  quantity: number
}
export type Order = {
  id: string
  order_number: string
  customer_id: string
  customer_name: string
  customer_email: string
  phone: string
  delivery_address: string
  items_subtotal: number
  delivery_fee: number
  bank_name: string
  account_name: string
  account_number: string
  total: number
  status: 'awaiting_payment' | 'awaiting_review' | 'confirmed' | 'rejected' | 'expired'
  proof_path: string | null
  hold_until: string | null
  created_at: string
  order_items: OrderItem[]
}
export type PaymentSettings = {
  bank_name: string
  account_name: string
  account_number: string
  delivery_fee: number
}
export const formatMoney = (amount: number) => `₦${amount.toLocaleString('en-NG')}`
export const formatDate = (date: string) => new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(date))
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.'
