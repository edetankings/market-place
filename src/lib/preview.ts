import type { Product } from './marketplace'

export type PreviewProfile = {
  name: string
  email: string
  phone: string
  address: string
}

export type PreviewOrder = {
  id: string
  order_number: string
  customer_name: string
  customer_email: string
  phone: string
  delivery_address: string
  items: Array<{ product_id: string; product_name: string; unit_price: number; quantity: number }>
  items_subtotal: number
  delivery_fee: number
  total: number
  created_at: string
  status: 'preview'
}

const image = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=82`
const added = '2026-11-10T00:00:00.000Z'

export const previewProducts: Product[] = [
  { id: 'preview-clothing-01', name: 'Relaxed Linen Shirt', category: 'Clothing', price: 28500, image_url: image('photo-1598033129183-c4f50c736f10'), description: 'A breathable linen-blend shirt with an easy, relaxed fit.', color: 'Natural · S–XL', stock: 8, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-clothing-02', name: 'Everyday Straight-Leg Jeans', category: 'Clothing', price: 42000, image_url: image('photo-1542272604-787c3835535d'), description: 'Classic straight-leg denim for everyday wear.', color: 'Indigo · 28–34', stock: 6, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-clothing-03', name: 'Soft Knit Cardigan', category: 'Clothing', price: 36500, image_url: image('photo-1576566588028-4147f3842f27'), description: 'A soft, lightweight layer in a versatile neutral shade.', color: 'Oat · S–L', stock: 4, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-clothing-04', name: 'Cotton Poplin Midi Dress', category: 'Clothing', price: 39000, image_url: image('photo-1595777457583-95e059d581b8'), description: 'A simple cotton midi dress with a clean, flattering silhouette.', color: 'Ivory · S–XL', stock: 5, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-bag-01', name: 'Everyday Canvas Tote', category: 'Bags', price: 14500, image_url: image('photo-1544816155-12df9643f363'), description: 'A roomy canvas tote for errands, work and weekend plans.', color: 'Natural · One size', stock: 12, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-bag-02', name: 'Structured Shoulder Bag', category: 'Bags', price: 32000, image_url: image('photo-1584917865442-de89df76afd3'), description: 'A polished shoulder bag sized for your everyday essentials.', color: 'Chocolate · One size', stock: 4, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-bag-03', name: 'Woven Market Basket', category: 'Bags', price: 22500, image_url: image('photo-1590874103328-eac38a683ce7'), description: 'A woven carryall with room for all the little extras.', color: 'Tan · One size', stock: 7, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-bag-04', name: 'Mini Crossbody Bag', category: 'Bags', price: 27500, image_url: image('photo-1566150905458-1bf1fc113f0d'), description: 'A compact crossbody bag with an adjustable strap.', color: 'Black · One size', stock: 3, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-accessory-01', name: 'Classic Everyday Sunglasses', category: 'Accessories', price: 12500, image_url: image('photo-1511499767150-a48a237f0083'), description: 'An easy-to-style frame with a timeless shape.', color: 'Tortoise · One size', stock: 9, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-accessory-02', name: 'Minimal Gold-Tone Hoops', category: 'Accessories', price: 9800, image_url: image('photo-1535632066927-ab7c9ab60908'), description: 'Lightweight hoops that work from day to evening.', color: 'Gold tone · One size', stock: 10, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-accessory-03', name: 'Soft Cotton Headscarf', category: 'Accessories', price: 8500, image_url: image('photo-1601924994987-69e26d50dc26'), description: 'A soft cotton scarf for styling, wrapping or gifting.', color: 'Printed · One size', stock: 8, seller_name: 'Common Thread', status: 'active', created_at: added },
  { id: 'preview-accessory-04', name: 'Textured Leather Belt', category: 'Accessories', price: 16000, image_url: image('photo-1624222247344-550fb8b1c6a8'), description: 'A versatile belt with a subtle textured finish.', color: 'Brown · S–L', stock: 5, seller_name: 'Common Thread', status: 'active', created_at: added },
]

const profileKey = 'common-thread-preview-profile'
const activeKey = 'common-thread-preview-active'
const ordersKey = 'common-thread-preview-orders'

export function readPreviewProfile(): PreviewProfile | null {
  try {
    const saved = localStorage.getItem(profileKey)
    if (!saved) return null
    const profile = JSON.parse(saved) as PreviewProfile
    return typeof profile.name === 'string' && typeof profile.email === 'string'
      ? { name: profile.name, email: profile.email, phone: profile.phone || '', address: profile.address || '' }
      : null
  } catch {
    return null
  }
}

export function isPreviewActive() {
  return localStorage.getItem(activeKey) === 'true'
}

export function savePreviewProfile(profile: PreviewProfile) {
  localStorage.setItem(profileKey, JSON.stringify(profile))
  localStorage.setItem(activeKey, 'true')
}

export function deactivatePreviewProfile() {
  localStorage.removeItem(activeKey)
}

export function readPreviewOrders(): PreviewOrder[] {
  try {
    return JSON.parse(localStorage.getItem(ordersKey) || '[]') as PreviewOrder[]
  } catch {
    return []
  }
}

export function savePreviewOrder(order: PreviewOrder) {
  localStorage.setItem(ordersKey, JSON.stringify([order, ...readPreviewOrders()]))
}
