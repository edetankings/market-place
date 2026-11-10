import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { gsap } from 'gsap'
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { errorMessage, formatDate, formatMoney, type Category, type Order, type PaymentSettings, type Product, type UserRole } from './lib/marketplace'
import { deactivatePreviewProfile, isPreviewActive, previewProducts, readPreviewOrders, readPreviewProfile, savePreviewOrder, savePreviewProfile as persistPreviewProfile, type PreviewOrder, type PreviewProfile } from './lib/preview'
import { isSupabaseConfigured, requireSupabase } from './lib/supabase'
import './App.css'

type AuthState = { userId: string | null; email: string; displayName: string; role: UserRole | null; loading: boolean }
type AuthContextValue = AuthState & { preview: boolean; previewProfile: PreviewProfile | null; savePreviewProfile: (profile: PreviewProfile) => void; signOutPreview: () => void }
type CartLine = { product: Product; quantity: number }
type CartState = { items: CartLine[]; add: (product: Product) => void; remove: (productId: string) => void; change: (productId: string, delta: number) => void; clear: () => void }

const AuthContext = createContext<AuthContextValue>({ userId: null, email: '', displayName: '', role: null, loading: isSupabaseConfigured, preview: !isSupabaseConfigured, previewProfile: null, savePreviewProfile: () => {}, signOutPreview: () => {} })
const CartContext = createContext<CartState>({ items: [], add: () => {}, remove: () => {}, change: () => {}, clear: () => {} })
const categories: Array<Category | 'All pieces'> = ['All pieces', 'Clothing', 'Bags', 'Accessories']
const imageUrl = (image: string | null) => image || '/images/empty-product.svg'

function initialAuthState(): AuthState {
  const profile = isSupabaseConfigured ? null : readPreviewProfile()
  const signedIn = !isSupabaseConfigured && isPreviewActive() && Boolean(profile)
  return {
    userId: signedIn ? 'preview-customer' : null,
    email: signedIn ? profile?.email || '' : '',
    displayName: signedIn ? profile?.name || '' : '',
    role: signedIn ? 'customer' : null,
    loading: isSupabaseConfigured,
  }
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    search: <><circle cx="11" cy="11" r="7" /><path d="m16 16 4 4" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></>,
    bag: <><path d="M5 8h14l1 13H4L5 8Z" /><path d="M9 9V6a3 3 0 0 1 6 0v3" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    pin: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    upload: <><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M20 16.5v3H4v-3" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    menu: <><path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(initialAuthState)
  const [previewProfile, setPreviewProfileState] = useState<PreviewProfile | null>(() => isSupabaseConfigured ? null : readPreviewProfile())
  useEffect(() => {
    if (!isSupabaseConfigured) return
    const client = requireSupabase()
    let active = true
    const loadProfile = async (userId: string, email: string) => {
      const { data, error } = await client.from('profiles').select('role, display_name').eq('id', userId).maybeSingle()
      if (!active) return
      if (error) {
        console.error('Unable to load account profile', error)
        setAuth({ userId, email, displayName: '', role: null, loading: false })
        return
      }
      setAuth({ userId, email, displayName: data?.display_name || '', role: data?.role || 'customer', loading: false })
    }
    client.auth.getSession().then(({ data, error }) => {
      if (error) console.error('Unable to restore the saved sign-in', error)
      const user = data.session?.user
      if (user) void loadProfile(user.id, user.email || '')
      else if (active) setAuth({ userId: null, email: '', displayName: '', role: null, loading: false })
    })
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      if (user) void loadProfile(user.id, user.email || '')
      else if (active) setAuth({ userId: null, email: '', displayName: '', role: null, loading: false })
    })
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [])
  const saveLocalProfile = (profile: PreviewProfile) => {
    persistPreviewProfile(profile)
    setPreviewProfileState(profile)
    setAuth({ userId: 'preview-customer', email: profile.email, displayName: profile.name, role: 'customer', loading: false })
  }
  const signOutLocalProfile = () => {
    deactivatePreviewProfile()
    setAuth({ userId: null, email: '', displayName: '', role: null, loading: false })
  }
  return <AuthContext.Provider value={{ ...auth, preview: !isSupabaseConfigured, previewProfile, savePreviewProfile: saveLocalProfile, signOutPreview: signOutLocalProfile }}>{children}</AuthContext.Provider>
}

function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartLine[]>(() => {
    try { return JSON.parse(localStorage.getItem('common-thread-cart') || '[]') as CartLine[] } catch { return [] }
  })
  useEffect(() => { localStorage.setItem('common-thread-cart', JSON.stringify(items)) }, [items])
  const add = (product: Product) => setItems((current) => {
    const existing = current.find((line) => line.product.id === product.id)
    if (!product.stock || (existing && existing.quantity >= product.stock)) return current
    return existing
      ? current.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1, product } : line)
      : [...current, { product, quantity: 1 }]
  })
  const remove = (productId: string) => setItems((current) => current.filter((line) => line.product.id !== productId))
  const change = (productId: string, delta: number) => setItems((current) => current.flatMap((line) => {
    if (line.product.id !== productId) return [line]
    const quantity = Math.min(line.product.stock, line.quantity + delta)
    return quantity > 0 ? [{ ...line, quantity }] : []
  }))
  const clear = () => setItems([])
  return <CartContext.Provider value={{ items, add, remove, change, clear }}>{children}</CartContext.Provider>
}

function useAuth() { return useContext(AuthContext) }
function useCart() { return useContext(CartContext) }

function App() {
  return <BrowserRouter><AuthProvider><CartProvider><Site /></CartProvider></AuthProvider></BrowserRouter>
}

function Site() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { items } = useCart()
  const { userId, displayName } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const query = searchParams.get('q') || ''
  const navigate = useNavigate()
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [location.pathname])
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  const updateQuery = (value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set('q', value)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }
  return <div className="app-shell">
    <div className="announcement"><span>Good clothes, better finds.</span><span className="announcement-right">Thoughtfully picked, community loved <span aria-hidden="true">↗</span></span></div>
    <header className="site-header">
      <button className="mobile-menu icon-button" aria-label="Toggle navigation" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}><Icon name="menu" /></button>
      <Link className="wordmark" to="/" aria-label="Common Thread home">common<span>thread</span><i>.</i></Link>
      <nav className={mobileMenuOpen ? 'main-nav is-open' : 'main-nav'} aria-label="Main navigation">
        <Link to="/">Shop</Link><Link to="/#story">Our story</Link>
      </nav>
      <div className="header-actions">
        <label className="search-control"><Icon name="search" size={18} /><input aria-label="Search clothes" placeholder="Search clothing, bags and more" value={query} onChange={(event) => updateQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') navigate(`/?q=${encodeURIComponent(query)}#shop`) }} /></label>
        <Link className="icon-button account-button" aria-label={userId ? `Account for ${displayName}` : 'Sign in'} to={userId ? '/account' : '/auth'}><Icon name="user" /></Link>
        <Link className="icon-button bag-button" aria-label={`Shopping bag, ${count} items`} to="/cart"><Icon name="bag" /><span className="bag-count">{count}</span></Link>
      </div>
    </header>
    {!isSupabaseConfigured && <div className="preview-notice">Preview mode · Sample catalog and orders are saved only in this browser.</div>}
    <Routes>
      <Route path="/" element={!isSupabaseConfigured && !userId ? <Navigate to="/auth" replace /> : <Home query={query} onQueryChange={updateQuery} />} />
      <Route path="/products/:productId" element={<ProductPage />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/account" element={<AccountPage />} />
      <Route path="/orders/:orderId" element={<OrderPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    <Footer />
  </div>
}

function Home({ query, onQueryChange }: { query: string; onQueryChange: (value: string) => void }) {
  const heroRef = useRef<HTMLElement>(null)
  const [products, setProducts] = useState<Product[]>(() => isSupabaseConfigured ? [] : previewProducts)
  const [searchParams, setSearchParams] = useSearchParams()
  const category = categories.find((item) => item.toLowerCase() === (searchParams.get('category') || '').toLowerCase()) || 'All pieces'
  const [sort, setSort] = useState<'newest' | 'price-low' | 'price-high'>('newest')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let cancelled = false
    requireSupabase().from('products').select('*').eq('status', 'active').order('created_at', { ascending: false }).then(({ data, error: resultError }) => {
      if (cancelled) return
      if (resultError) setError(resultError.message)
      else setProducts((data || []) as Product[])
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [])
  const selectCategory = (item: Category | 'All pieces') => {
    const next = new URLSearchParams(searchParams)
    if (item === 'All pieces') next.delete('category')
    else next.set('category', item)
    setSearchParams(next, { replace: true })
  }
  useEffect(() => {
    if (!heroRef.current) return
    const context = gsap.context(() => {
      gsap.from('.hero-copy > *', { y: 28, opacity: 0, duration: 0.8, stagger: 0.12, ease: 'power3.out', delay: 0.1 })
      gsap.from('.hero-image', { scale: 1.08, opacity: 0, duration: 1.1, ease: 'power2.out' })
    }, heroRef)
    return () => context.revert()
  }, [])
  const visible = products.filter((product) => (category === 'All pieces' || product.category === category)
    && `${product.name} ${product.category} ${product.color}`.toLowerCase().includes(query.toLowerCase()))
    .sort((left, right) => sort === 'price-low' ? left.price - right.price : sort === 'price-high' ? right.price - left.price : 0)
  return <main id="top">
    <section className="hero-section" ref={heroRef}>
      <div className="hero-copy"><span className="eyebrow"><span className="eyebrow-dot" /> Clothing, bags & accessories</span><h1>Your style.<br /><em>Your find.</em></h1><p>Discover clothes, bags and accessories selected for the Common Thread collection — all in one place.</p><Link className="button button-dark hero-button" to="/#shop">Shop all items <Icon name="arrow" size={18} /></Link><div className="hero-footnote"><span>New finds, all together</span><span className="footnote-line" /><span>Delivery shown at checkout</span></div></div>
      <div className="hero-visual"><img className="hero-image" src="https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=1400&q=85" alt="Friends exploring clothing together" /><div className="image-note"><span className="note-star">✳</span><div><strong>Good finds, all together.</strong><small>Browse the latest listings</small></div></div><span className="hero-vertical-label">COMMON THREAD MARKETPLACE</span></div><span className="hero-index">SHOP · DISCOVER · REPEAT</span>
    </section>
    <section className="trust-row" aria-label="Marketplace details"><div className="trust-item"><span className="trust-number">01</span><p>Carefully selected<br />clothes and accessories</p></div><div className="trust-item"><span className="trust-number">02</span><p>Payment reviewed<br />before receipt confirmation</p></div><div className="trust-item"><span className="trust-number">03</span><p>Delivery cost shown<br />before you place an order</p></div><Link to="/#shop" className="trust-link">Shop the collection <Icon name="arrow" size={17} /></Link></section>
    <section className="shop-section section-wrap" id="shop">
      <div className="section-heading"><div><span className="eyebrow">The collection</span><h2>Find your <em>next favourite.</em></h2></div></div>
      <div className="shop-toolbar"><div className="category-list" role="group" aria-label="Filter products by category">{categories.map((item) => <button key={item} className={category === item ? 'category-chip active' : 'category-chip'} onClick={() => selectCategory(item)}>{item}</button>)}</div><div className="shop-controls"><span className="results-count">{loading ? 'Loading listings' : `${visible.length} ${visible.length === 1 ? 'item' : 'items'}`}</span><label className="sort-control">Sort by <select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort products"><option value="newest">Recently added</option><option value="price-low">Price: low to high</option><option value="price-high">Price: high to low</option></select></label></div></div>
      {error && <ErrorBanner message={`Could not load products: ${error}`} />}
      <div className="product-grid">
        {visible.map((product, index) => <ProductCard key={product.id} product={product} index={index} />)}
        {!loading && !error && !visible.length && <div className="empty-search"><span>✳</span><p>{products.length ? 'No pieces match that search.' : 'Our new arrivals are on their way.'}</p>{products.length > 0 && <button className="text-link" onClick={() => { onQueryChange(''); selectCategory('All pieces') }}>Clear filters <Icon name="arrow" size={15} /></button>}</div>}
        {loading && <div className="loading-state">Finding the good stuff…</div>}
      </div>
      <div className="shop-bottom"><span>Showing available pieces</span></div>
    </section>
    <section className="editorial-section" id="story"><div className="editorial-image"><img src="https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=1200&q=85" alt="A styled outfit from the Common Thread collection" loading="lazy" /><span className="editorial-image-caption">STYLE, SHARED.</span></div><div className="editorial-copy"><span className="eyebrow">A little more meaning</span><h2>Good style<br />goes <em>around.</em></h2><p>Common Thread brings together clothes, bags and accessories selected for the people who love finding them. Discover a new favourite and make a little room for something new.</p><Link className="text-link editorial-link" to="/#shop">Explore the collection <Icon name="arrow" size={17} /></Link><div className="editorial-stamp"><span>✳</span><small>FOUND<br />WITH LOVE<br />IN LAGOS</small></div></div></section>
  </main>
}

function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { add } = useCart()
  return <motion.article className="product-card" initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.45, delay: (index % 4) * .06 }}>
    <Link className="product-image-button" to={`/products/${product.id}`}><img src={imageUrl(product.image_url)} alt={product.name} loading="lazy" />{product.stock <= 3 && <span className="product-tag">{product.stock ? `Only ${product.stock} left` : 'Sold out'}</span>}<span className="quick-view">Take a closer look <Icon name="arrow" size={15} /></span></Link>
    <div className="product-details"><div><span className="product-category">{product.category} · {product.color}</span><h3>{product.name}</h3></div><span className="product-price">{formatMoney(product.price)}</span></div>
    <button className="add-button" disabled={!product.stock} onClick={() => add(product)}>{product.stock ? 'Add to bag' : 'Sold out'} <Icon name="plus" size={16} /></button>
  </motion.article>
}

function AuthPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mode, setMode] = useState<'signup' | 'login'>('signup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setMessage('')
    const data = new FormData(event.currentTarget)
    if (auth.preview) {
      const profile = {
        name: String(data.get('name') || '').trim(),
        email: String(data.get('email') || '').trim().toLowerCase(),
        phone: '',
        address: '',
      }
      if (profile.name.length < 2 || !profile.email) {
        setBusy(false)
        setError('Enter your name and email to open the preview.')
        return
      }
      auth.savePreviewProfile(profile)
      setBusy(false)
      navigate(new URLSearchParams(location.search).get('next') || '/', { replace: true })
      return
    }
    const client = requireSupabase()
    const email = String(data.get('email')).trim()
    const password = String(data.get('password'))
    const result = mode === 'signup'
      ? await client.auth.signUp({ email, password, options: { data: { display_name: String(data.get('name')).trim() } } })
      : await client.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (result.error) { setError(result.error.message); return }
    if (mode === 'signup' && !result.data.session) { setMessage('Check your email to confirm your account, then sign in to continue.'); return }
    const redirect = new URLSearchParams(location.search).get('next') || (auth.preview ? '/' : location.pathname.startsWith('/admin') ? '/admin' : '/account')
    navigate(redirect)
  }
  if (auth.loading) return <PageLoading />
  if (auth.userId) return <Navigate to="/account" replace />
  return <PageFrame><div className="page-intro"><span className="eyebrow">{auth.preview ? 'Welcome to Common Thread' : mode === 'signup' ? 'Pull up a chair' : 'Good to see you again'}</span><h1>{auth.preview ? <>Take a look<br /><em>around.</em></> : mode === 'signup' ? <>Good to have<br /><em>you here.</em></> : <>Welcome<br /><em>back.</em></>}</h1><p>{auth.preview ? 'Create a local preview profile to explore the catalog, place a sample order and try your account settings. No real account or payment is created.' : mode === 'signup' ? 'Create your account to check out, follow orders and keep your good finds together.' : 'Sign in to find your orders and receipts.'}</p></div><section className="form-page-card">
    {error && <ErrorBanner message={error} />}{message && <div className="success-banner">{message}</div>}
    <form className="stack-form" onSubmit={(event) => void submit(event)}>{(auth.preview || mode === 'signup') && <label>Your name<input name="name" autoComplete="name" required minLength={2} defaultValue={auth.previewProfile?.name || ''} placeholder="What should we call you?" /></label>}<label>Email address<input name="email" type="email" autoComplete="email" required defaultValue={auth.previewProfile?.email || ''} placeholder="you@example.com" /></label>{!auth.preview && <label>Password<input name="password" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={8} placeholder="At least 8 characters" /></label>}<button className="button button-dark form-submit" type="submit" disabled={busy || (!auth.preview && !isSupabaseConfigured)}>{busy ? 'Just a moment…' : auth.preview ? 'Enter the preview shop' : mode === 'signup' ? 'Create your account' : 'Sign in'} <Icon name="arrow" size={18} /></button></form>
    {!auth.preview && <p className="form-switch">{mode === 'signup' ? 'Already have an account?' : 'New to Common Thread?'} <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setMessage('') }}>{mode === 'signup' ? 'Sign in' : 'Create an account'}</button></p>}
  </section></PageFrame>
}

function ProductPage() {
  const { productId = '' } = useParams()
  const [product, setProduct] = useState<Product | null>(null)
  const displayedProduct = isSupabaseConfigured ? product : previewProducts.find((item) => item.id === productId) || null
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const { add } = useCart()
  useEffect(() => {
    let cancelled = false
    if (!isSupabaseConfigured) return
    requireSupabase().from('products').select('*').eq('id', productId).eq('status', 'active').maybeSingle().then(({ data, error: resultError }) => {
      if (cancelled) return
      if (resultError) setError(resultError.message)
      else setProduct(data as Product | null)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [productId])
  if (error) return <PageFrame><ErrorBanner message={error} /></PageFrame>
  if (loading) return <PageLoading />
  if (!displayedProduct) return <PageFrame><EmptyState title="That piece has found a home." text="It may have sold already. There are more good finds in the shop." action="Browse the shop" to="/" /></PageFrame>
  return <PageFrame><div className="product-page"><div className="product-page-image"><img src={imageUrl(displayedProduct.image_url)} alt={displayedProduct.name} /></div><div className="product-page-info"><span className="eyebrow">{displayedProduct.category} · {displayedProduct.color}</span><h1>{displayedProduct.name}</h1><strong className="product-page-price">{formatMoney(displayedProduct.price)}</strong><p>{displayedProduct.description || 'Thoughtfully selected and ready for a new home.'}</p><p className="product-stock">{displayedProduct.stock ? `${displayedProduct.stock} available` : 'Currently sold out'}</p><button className="button button-dark" disabled={!displayedProduct.stock} onClick={() => add(displayedProduct)}>Add to your bag <Icon name="arrow" size={18} /></button><p className="product-page-note">A little different. A lot more you.</p></div></div></PageFrame>
}

function CartPage() {
  const cart = useCart()
  const navigate = useNavigate()
  const total = cart.items.reduce((sum, line) => sum + line.product.price * line.quantity, 0)
  return <PageFrame><div className="page-heading"><span className="eyebrow">Your good finds</span><h1>Your <em>bag.</em></h1></div>
    {cart.items.length ? <div className="cart-page-layout"><div className="cart-page-items">{cart.items.map(({ product, quantity }) => <article className="cart-page-item" key={product.id}><Link to={`/products/${product.id}`}><img src={imageUrl(product.image_url)} alt={product.name} /></Link><div><span className="product-category">{product.category} · {product.color}</span><Link className="cart-product-name" to={`/products/${product.id}`}>{product.name}</Link><div className="quantity-control"><button aria-label={`Remove one ${product.name}`} onClick={() => cart.change(product.id, -1)}>−</button><span>{quantity}</span><button aria-label={`Add one ${product.name}`} onClick={() => cart.change(product.id, 1)}>+</button></div></div><strong>{formatMoney(product.price * quantity)}</strong><button className="remove-line" onClick={() => cart.remove(product.id)}>Remove</button></article>)}</div><aside className="cart-page-summary"><span className="eyebrow">A little summary</span><div><span>Subtotal</span><strong>{formatMoney(total)}</strong></div><p>Delivery is confirmed for your area before dispatch.</p><button className="button button-dark form-submit" onClick={() => navigate('/checkout')}>Continue to checkout <Icon name="arrow" size={18} /></button><Link className="continue-shopping" to="/">Keep finding good things</Link></aside></div> : <EmptyState title="Your bag is taking a breather." text="There are good things waiting to be found." action="Go find something" to="/" />}</PageFrame>
}

function CheckoutPage() {
  const auth = useAuth()
  const cart = useCart()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const resumeOrderId = searchParams.get('order')
  const [settings, setSettings] = useState<PaymentSettings | null>(null)
  const [reservedOrder, setReservedOrder] = useState<Order | null>(null)
  const [address, setAddress] = useState(auth.previewProfile?.address || '')
  const [phone, setPhone] = useState(auth.previewProfile?.phone || '')
  const [proof, setProof] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const subtotal = cart.items.reduce((sum, line) => sum + line.product.price * line.quantity, 0)
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    const loadCheckout = async () => {
      const client = requireSupabase()
      const cleanup = await client.rpc('release_expired_marketplace_holds')
      if (cleanup.error && active) setError(cleanup.error.message)
      const { data: settingsData, error: settingsError } = await client.from('marketplace_settings').select('bank_name, account_name, account_number, delivery_fee').eq('id', 1).single()
      if (!active) return
      if (settingsError) setError(`Could not load payment instructions: ${settingsError.message}`)
      else setSettings(settingsData as PaymentSettings)
      if (resumeOrderId && auth.userId) {
        const { data, error: orderError } = await client.from('orders').select('*, order_items(*)').eq('id', resumeOrderId).maybeSingle()
        if (!active) return
        if (orderError) setError(orderError.message)
        else if (data?.status === 'awaiting_payment') {
          const order = data as Order
          setReservedOrder(order)
          setAddress(order.delivery_address)
          setPhone(order.phone)
        } else if (data) setError(`This order is ${data.status.replace('_', ' ')} and can’t accept payment proof.`)
        else setError('That order was not found.')
      }
      setLoading(false)
    }
    if (auth.userId) void loadCheckout()
    return () => { active = false }
  }, [auth.userId, resumeOrderId])
  const reserveOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!auth.userId) { navigate(`/auth?next=${encodeURIComponent('/checkout')}`); return }
    if (!cart.items.length) return
    setBusy(true); setError('')
    if (auth.preview) {
      if (!auth.previewProfile) {
        setBusy(false)
        navigate(`/auth?next=${encodeURIComponent('/checkout')}`)
        return
      }
      const id = crypto.randomUUID()
      const deliveryFee = 2500
      const order: PreviewOrder = {
        id,
        order_number: `PREVIEW-${Date.now().toString().slice(-6)}`,
        customer_name: auth.previewProfile.name,
        customer_email: auth.previewProfile.email,
        phone: phone.trim(),
        delivery_address: address.trim(),
        items: cart.items.map(({ product, quantity }) => ({ product_id: product.id, product_name: product.name, unit_price: product.price, quantity })),
        items_subtotal: subtotal,
        delivery_fee: deliveryFee,
        total: subtotal + deliveryFee,
        created_at: new Date().toISOString(),
        status: 'preview',
      }
      savePreviewOrder(order)
      auth.savePreviewProfile({ ...auth.previewProfile, phone: phone.trim(), address: address.trim() })
      cart.clear()
      setBusy(false)
      navigate(`/orders/${id}`)
      return
    }
    try {
      const client = requireSupabase()
      const { data, error: orderError } = await client.rpc('start_marketplace_order', {
        p_delivery_address: address.trim(),
        p_phone: phone.trim(),
        p_items: cart.items.map((line) => ({ product_id: line.product.id, quantity: line.quantity })),
      })
      if (orderError) throw orderError
      const { data: orderData, error: fetchError } = await client.from('orders').select('*, order_items(*)').eq('id', String(data)).single()
      if (fetchError) throw fetchError
      setReservedOrder(orderData as Order)
      navigate(`/checkout?order=${encodeURIComponent(String(data))}`, { replace: true })
    } catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  const submitProof = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!auth.userId || !reservedOrder || !proof) return
    setBusy(true); setError('')
    const client = requireSupabase()
    const proofPath = `${auth.userId}/${crypto.randomUUID()}-${proof.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    try {
      const uploaded = await client.storage.from('payment-proofs').upload(proofPath, proof, { upsert: false, contentType: proof.type })
      if (uploaded.error) throw uploaded.error
      const { data, error: proofError } = await client.rpc('submit_marketplace_payment_proof', { p_order_id: reservedOrder.id, p_proof_path: uploaded.data.path })
      if (proofError) { await client.storage.from('payment-proofs').remove([uploaded.data.path]); throw proofError }
      if (!data) {
        await client.storage.from('payment-proofs').remove([uploaded.data.path])
        setReservedOrder({ ...reservedOrder, status: 'expired' })
        setError('Your 30-minute stock hold expired before proof was submitted. Your stock has been released; start checkout again.')
        return
      }
      cart.clear()
      navigate(`/orders/${reservedOrder.id}`)
    } catch (caught) { setError(errorMessage(caught)) } finally { setBusy(false) }
  }
  if (!auth.userId && !auth.loading) return <Navigate to={`/auth?next=${encodeURIComponent('/checkout')}`} replace />
  if (auth.loading) return <PageLoading />
  if (loading) return <PageLoading />
  if (!cart.items.length && !reservedOrder) return <PageFrame><EmptyState title="Your bag is empty." text="Add a few good finds before checking out." action="Browse the shop" to="/" /></PageFrame>
  const orderItems = reservedOrder?.order_items
  const deliveryFee = auth.preview ? 2500 : settings?.delivery_fee || 0
  const total = reservedOrder?.total ?? subtotal + deliveryFee
  return <PageFrame><div className="page-heading"><span className="eyebrow">{auth.preview ? 'Sample checkout' : reservedOrder ? 'Your order is reserved for 30 minutes' : 'One last little thing'}</span><h1>Checkout <em>{auth.preview ? 'preview.' : 'securely.'}</em></h1><p>{auth.preview ? 'Enter delivery details to try the order flow. This creates a sample order in this browser only; no payment is taken.' : reservedOrder ? 'Transfer the exact amount below, then upload your proof so our team can confirm your order.' : 'Add your delivery location and phone number. We’ll confirm live stock and reserve the total before showing payment details.'}</p></div>
    <div className="checkout-layout"><div className="form-page-card checkout-form">{error && <ErrorBanner message={error} />}
      {!reservedOrder ? <form className="stack-form" onSubmit={(event) => void reserveOrder(event)}><h2>Delivery details</h2><label>Delivery address<textarea value={address} onChange={(event) => setAddress(event.target.value)} rows={3} required placeholder="Street, area, city and any helpful directions" /></label><label>Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} required placeholder="+234 800 000 0000" /></label><p className="muted-copy">{auth.preview ? 'Sample delivery fee is ₦2,500. No booking or payment is sent to a store.' : 'Your order and amount are verified against live stock and locked for 30 minutes before you transfer.'}</p><button className="button button-dark form-submit" type="submit" disabled={busy || (!auth.preview && !settings?.account_number)}>{busy ? 'Placing sample order…' : auth.preview ? 'Place sample order' : 'Confirm order & show payment details'} <Icon name="arrow" size={18} /></button></form>
        : <><h2>Transfer to this account</h2>{reservedOrder.account_number ? <div className="bank-card"><span>TRANSFER DETAILS · COMMON THREAD</span><strong>{reservedOrder.account_name}</strong><div><span>Bank</span><b>{reservedOrder.bank_name}</b></div><div><span>Account number</span><b>{reservedOrder.account_number}</b></div><div><span>Order number</span><b>{reservedOrder.order_number}</b></div><div><span>Order total (delivery included)</span><b>{formatMoney(reservedOrder.total)}</b></div></div> : <ErrorBanner message="The marketplace has not added bank transfer details yet." />}
          <form className="stack-form" onSubmit={(event) => void submitProof(event)}><label className="upload-field">Upload proof of payment<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required onChange={(event) => setProof(event.target.files?.[0] || null)} /><span className="upload-prompt"><Icon name="upload" size={18} /> {proof?.name || 'Choose a screenshot or PDF receipt'}</span></label><p className="muted-copy">Our team will check the transfer and confirm your receipt here in your account.</p><button className="button button-dark form-submit" type="submit" disabled={busy || !proof || !reservedOrder.account_number}>{busy ? 'Uploading proof…' : 'Submit payment proof'} <Icon name="arrow" size={18} /></button></form></>}
    </div><aside className="checkout-summary"><span className="eyebrow">{reservedOrder ? `Order ${reservedOrder.order_number}` : 'Your order'}</span>{reservedOrder ? orderItems?.map((item) => <div className="checkout-line" key={item.id}><span>{item.product_name} × {item.quantity}</span><strong>{formatMoney(item.unit_price * item.quantity)}</strong></div>) : cart.items.map(({ product, quantity }) => <div className="checkout-line" key={product.id}><span>{product.name} × {quantity}</span><strong>{formatMoney(product.price * quantity)}</strong></div>)}<div className="checkout-line"><span>Delivery</span><strong>{reservedOrder ? formatMoney(reservedOrder.delivery_fee) : settings ? formatMoney(settings.delivery_fee) : formatMoney(deliveryFee)}</strong></div><div className="checkout-total"><span>Total</span><strong>{formatMoney(total)}</strong></div></aside></div>
  </PageFrame>
}

function AccountPage() {
  const auth = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const previewOrders = auth.preview ? readPreviewOrders() : []
  const [name, setName] = useState(auth.previewProfile?.name || auth.displayName)
  const [phone, setPhone] = useState(auth.previewProfile?.phone || '')
  const [address, setAddress] = useState(auth.previewProfile?.address || '')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  useEffect(() => {
    if (!auth.userId) return
    if (auth.preview) return
    const client = requireSupabase()
    const refreshOrders = async () => {
      const cleanup = await client.rpc('release_expired_marketplace_holds')
      if (cleanup.error) setError(cleanup.error.message)
      const { data, error: resultError } = await client.from('orders').select('*, order_items(*)').order('created_at', { ascending: false })
      if (resultError) setError(resultError.message)
      else setOrders((data || []) as Order[])
      setLoading(false)
    }
    void refreshOrders()
    const channel = client.channel(`account-orders-${auth.userId}`).on('postgres_changes', {
      event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${auth.userId}`,
    }, () => { void refreshOrders() }).subscribe()
    return () => { void client.removeChannel(channel) }
  }, [auth.userId, auth.preview])
  const saveAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    if (auth.preview) {
      auth.savePreviewProfile({ name: name.trim(), email: auth.email, phone: phone.trim(), address: address.trim() })
      setNotice('Preview account details saved in this browser.')
      setBusy(false)
      return
    }
    const { error: updateError } = await requireSupabase().from('profiles').update({ display_name: name.trim() }).eq('id', auth.userId)
    if (updateError) setError(updateError.message)
    else setNotice('Account details saved.')
    setBusy(false)
  }
  const signOut = async () => {
    if (auth.preview) { auth.signOutPreview(); navigate('/auth'); return }
    const { error: signOutError } = await requireSupabase().auth.signOut()
    if (signOutError) setError(signOutError.message)
    else navigate('/')
  }
  if (auth.loading) return <PageLoading />
  if (!auth.userId) return <Navigate to="/auth?next=%2Faccount" replace />
  const hasOrders = auth.preview ? previewOrders.length > 0 : orders.length > 0
  return <PageFrame><div className="page-heading"><span className="eyebrow">{auth.preview ? 'Preview account' : 'Your Common Thread'}</span><h1>Hey, {auth.displayName || 'there'}.</h1><p>{auth.email}</p><button className="text-link" onClick={() => void signOut()}>Sign out</button></div>{error && <ErrorBanner message={error} />}{notice && <div className="success-banner">{notice}</div>}
    <div className="account-layout"><form className="form-page-card stack-form account-settings" onSubmit={(event) => void saveAccount(event)}><h2>Account details</h2><label>Your name<input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></label><label>Email address<input value={auth.email} readOnly /></label><label>Phone number<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+234 800 000 0000" /></label><label>Delivery address<textarea rows={3} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Add your preferred delivery address" /></label>{auth.preview && <p className="muted-copy">Preview details are saved only in this browser.</p>}<button className="button button-dark" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save account details'} <Icon name="check" size={17} /></button></form>
      <section className="account-orders"><h2>Your orders</h2>{loading ? <PageLoading /> : hasOrders ? auth.preview ? previewOrders.map((order) => <Link className="account-order" to={`/orders/${order.id}`} key={order.id}><div><b>{order.order_number}</b><small>{formatDate(order.created_at)} · {order.items.length} piece(s)</small></div><span className="order-status">{auth.preview ? 'sample' : order.status.replace('_', ' ')}</span><strong>{formatMoney(order.total)} →</strong></Link>) : orders.map((order) => <Link className="account-order" to={`/orders/${order.id}`} key={order.id}><div><b>{order.order_number}</b><small>{formatDate(order.created_at)} · {order.order_items?.length || 0} piece(s)</small></div><span className={`order-status ${order.status === 'confirmed' ? 'confirmed' : ''}`}>{order.status.replace('_', ' ')}</span><strong>{formatMoney(order.total)} →</strong></Link>) : <EmptyState title="Nothing in your order book yet." text="Let’s find your first good thing." action="Browse the shop" to="/" />}</section></div></PageFrame>
}

function OrderPage() {
  const { orderId = '' } = useParams()
  const auth = useAuth()
  const [order, setOrder] = useState<Order | null>(null)
  const previewOrder = auth.preview ? readPreviewOrders().find((item) => item.id === orderId) || null : null
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(isSupabaseConfigured)
  useEffect(() => {
    if (!auth.userId) return
    if (auth.preview) return
    const client = requireSupabase()
    const refreshOrder = async () => {
      const cleanup = await client.rpc('release_expired_marketplace_holds')
      if (cleanup.error) setError(cleanup.error.message)
      const { data, error: resultError } = await client.from('orders').select('*, order_items(*)').eq('id', orderId).maybeSingle()
      if (resultError) setError(resultError.message)
      else setOrder(data as Order | null)
      setLoading(false)
    }
    void refreshOrder()
    const channel = client.channel(`order-receipt-${orderId}`).on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}`,
    }, () => { void refreshOrder() }).subscribe()
    return () => { void client.removeChannel(channel) }
  }, [auth.userId, auth.preview, orderId])
  if (auth.loading) return <PageLoading />
  if (!auth.userId) return <Navigate to={`/auth?next=${encodeURIComponent(`/orders/${orderId}`)}`} replace />
  if (auth.preview) {
    if (loading) return <PageLoading />
    if (!previewOrder) return <PageFrame><EmptyState title="We can’t find that sample order." text="Your preview bookings are listed in your account." action="My account" to="/account" /></PageFrame>
    return <PageFrame><div className="receipt-page"><div className="preview-label">SAMPLE ORDER · NOT A REAL PURCHASE</div><div className="receipt-mark"><Icon name="check" size={23} /></div><span className="eyebrow">Preview order placed</span><h1>Your order <em>preview.</em></h1><p>This sample booking is saved in this browser only. No payment was made and nothing will be delivered.</p><div className="receipt-card"><div className="receipt-top"><span>COMMON THREAD · SAMPLE</span><strong>{previewOrder.order_number}</strong></div><div className="receipt-row"><span>Placed by</span><b>{previewOrder.customer_name}</b></div><div className="receipt-row"><span>Date</span><b>{formatDate(previewOrder.created_at)}</b></div><div className="receipt-items">{previewOrder.items.map((item) => <div key={item.product_id}><span>{item.product_name} × {item.quantity}</span><b>{formatMoney(item.unit_price * item.quantity)}</b></div>)}</div><div className="receipt-row"><span>Delivery (sample)</span><b>{formatMoney(previewOrder.delivery_fee)}</b></div><div className="receipt-total"><span>Sample total</span><strong>{formatMoney(previewOrder.total)}</strong></div><div className="receipt-address"><Icon name="pin" size={16} />{previewOrder.delivery_address}</div></div><Link className="button button-dark" to="/account">View my account <Icon name="arrow" size={18} /></Link></div></PageFrame>
  }
  if (error) return <PageFrame><ErrorBanner message={error} /></PageFrame>
  if (loading) return <PageLoading />
  if (!order) return <PageFrame><EmptyState title="We can’t find that order." text="Check your account for your current orders." action="My account" to="/account" /></PageFrame>
  const awaitingPayment = order.status === 'awaiting_payment'
  return <PageFrame><div className="receipt-page"><div className="receipt-mark">{order.status === 'confirmed' ? <Icon name="check" size={23} /> : '✳'}</div><span className="eyebrow">{order.status === 'confirmed' ? 'Payment confirmed' : order.status === 'rejected' ? 'Payment needs attention' : awaitingPayment ? 'Order reserved' : order.status === 'expired' ? 'Stock hold expired' : 'Proof received'}</span><h1>{order.status === 'confirmed' ? 'It’s a done deal.' : order.status === 'rejected' ? 'Let’s sort this out.' : awaitingPayment ? 'Ready when you are.' : order.status === 'expired' ? 'The hold has ended.' : 'We’re on it.'}</h1><p>{order.status === 'confirmed' ? 'Your order is confirmed. Show this receipt when you collect your pieces.' : order.status === 'rejected' ? 'Your proof was not approved. Contact our team for help with next steps.' : awaitingPayment ? 'Your selected items are held for 30 minutes. Complete your bank transfer and upload proof to continue.' : order.status === 'expired' ? 'The 30-minute reservation expired and the items are available to other shoppers.' : 'Your payment proof is with our team. Once confirmed, your final receipt will be ready right here.'}</p><div className="receipt-card"><div className="receipt-top"><span>COMMON THREAD · {order.status === 'confirmed' ? 'RECEIPT' : 'ORDER SUMMARY'}</span><strong>{order.order_number}</strong></div><div className="receipt-row"><span>Placed by</span><b>{order.customer_name}</b></div><div className="receipt-row"><span>Date</span><b>{formatDate(order.created_at)}</b></div><div className="receipt-items">{order.order_items?.map((item) => <div key={item.id}><span>{item.product_name} × {item.quantity}</span><b>{formatMoney(item.unit_price * item.quantity)}</b></div>)}</div><div className="receipt-row"><span>Delivery</span><b>{formatMoney(order.delivery_fee)}</b></div><div className="receipt-total"><span>{order.status === 'confirmed' ? 'Total paid' : 'Order total'}</span><strong>{formatMoney(order.total)}</strong></div><div className="receipt-address"><Icon name="pin" size={16} />{order.delivery_address}</div><span className={`order-status ${order.status === 'confirmed' ? 'confirmed' : ''}`}>{order.status.replace('_', ' ').toUpperCase()}</span></div>{awaitingPayment ? <Link className="button button-dark" to={`/checkout?order=${order.id}`}>Continue payment <Icon name="arrow" size={18} /></Link> : <Link className="button button-dark" to="/account">Back to my account <Icon name="arrow" size={18} /></Link>}</div></PageFrame>
}

function AdminLoginPage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('')
    const data = new FormData(event.currentTarget)
    const { data: result, error: resultError } = await requireSupabase().auth.signInWithPassword({ email: String(data.get('email')), password: String(data.get('password')) })
    setBusy(false)
    if (resultError) { setError(resultError.message); return }
    const { data: profile, error: profileError } = await requireSupabase().from('profiles').select('role').eq('id', result.user.id).single()
    if (profileError || profile.role !== 'admin') {
      await requireSupabase().auth.signOut()
      setError(profileError?.message || 'This account does not have administrator access.')
      return
    }
    navigate('/admin')
  }
  if (auth.loading) return <PageLoading />
  if (auth.userId && auth.role === 'admin') return <Navigate to="/admin" replace />
  return <PageFrame><div className="page-intro"><span className="eyebrow">Team access</span><h1>Admin <em>desk.</em></h1><p>Sign in with your administrator account.</p></div><section className="form-page-card">{error && <ErrorBanner message={error} />}<form className="stack-form" onSubmit={(event) => void submit(event)}><label>Email address<input type="email" name="email" autoComplete="username" required /></label><label>Password<input type="password" name="password" autoComplete="current-password" required /></label><button className="button button-dark form-submit" disabled={busy || !isSupabaseConfigured}>{busy ? 'Signing in…' : 'Open admin desk'} <Icon name="arrow" size={18} /></button></form></section></PageFrame>
}

function AdminPage() {
  const auth = useAuth()
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [settings, setSettings] = useState<PaymentSettings>({ bank_name: '', account_name: '', account_number: '', delivery_fee: 0 })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [proofUrl, setProofUrl] = useState('')
  const loadAdminData = async () => {
    const client = requireSupabase()
    const cleanup = await client.rpc('release_expired_marketplace_holds')
    if (cleanup.error) { setError(cleanup.error.message); return }
    const [productResult, orderResult, settingsResult] = await Promise.all([
      client.from('products').select('*').order('created_at', { ascending: false }),
      client.from('orders').select('*, order_items(*)').order('created_at', { ascending: false }),
      client.from('marketplace_settings').select('bank_name, account_name, account_number, delivery_fee').eq('id', 1).single(),
    ])
    const failure = productResult.error || orderResult.error || settingsResult.error
    if (failure) { setError(failure.message); return }
    setProducts((productResult.data || []) as Product[])
    setOrders((orderResult.data || []) as Order[])
    setSettings(settingsResult.data as PaymentSettings)
  }
  useEffect(() => {
    if (auth.role !== 'admin') return
    const timer = window.setTimeout(() => { void loadAdminData() }, 0)
    return () => window.clearTimeout(timer)
  }, [auth.role])
  const updateSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const result = await requireSupabase().from('marketplace_settings').update(settings).eq('id', 1)
    setBusy(false)
    if (result.error) setError(result.error.message)
    else setNotice('Payment and delivery settings saved.')
  }
  const saveProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const form = event.currentTarget
    const data = new FormData(form)
    const photo = data.get('photo')
    const client = requireSupabase()
    let photoPath: string | null = null
    try {
      if (photo instanceof File && photo.size) {
        photoPath = `products/${crypto.randomUUID()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const uploaded = await client.storage.from('product-images').upload(photoPath, photo, { contentType: photo.type })
        if (uploaded.error) throw uploaded.error
      }
      const { data: urlData } = photoPath ? client.storage.from('product-images').getPublicUrl(photoPath) : { data: { publicUrl: null } }
      const result = await client.from('products').insert({
        name: String(data.get('name')).trim(), category: String(data.get('category')),
        price: Number(data.get('price')), stock: Number(data.get('stock')),
        color: String(data.get('color')).trim(), description: String(data.get('description')).trim(),
        seller_name: String(data.get('seller_name')).trim(), image_url: urlData.publicUrl,
      })
      if (result.error) throw result.error
      setNotice('Product listing added.')
      form.reset()
      await loadAdminData()
    } catch (caught) {
      if (photoPath) await client.storage.from('product-images').remove([photoPath])
      setError(errorMessage(caught))
    } finally { setBusy(false) }
  }
  const reviewOrder = async (orderId: string, confirmed: boolean) => {
    setBusy(true); setError('')
    const { error: resultError } = await requireSupabase().rpc('review_marketplace_order', { p_order_id: orderId, p_confirm: confirmed })
    if (resultError) setError(resultError.message)
    else { setNotice(confirmed ? 'Payment confirmed and receipt issued.' : 'Order rejected and reserved stock released.'); await loadAdminData() }
    setBusy(false)
  }
  const viewProof = async (path: string) => {
    const { data, error: resultError } = await requireSupabase().storage.from('payment-proofs').createSignedUrl(path, 60)
    if (resultError) setError(resultError.message)
    else setProofUrl(data.signedUrl)
  }
  if (auth.loading) return <PageLoading />
  if (!auth.userId) return <Navigate to="/admin/login" replace />
  if (auth.role !== 'admin') return <PageFrame><ErrorBanner message="Your account is not authorized to open the admin dashboard." /><Link className="text-link" to="/">Back to storefront</Link></PageFrame>
  return <PageFrame><div className="page-heading admin-page-heading"><div><span className="eyebrow">The back room</span><h1>Admin <em>desk.</em></h1><p>Manage the shop collection, stock, orders and transfer settings.</p></div><button className="button button-light" onClick={() => void requireSupabase().auth.signOut()}>Sign out</button></div>{error && <ErrorBanner message={error} />}{notice && <div className="success-banner">{notice}</div>}
    <form className="form-page-card admin-settings stack-form" onSubmit={(event) => void updateSettings(event)}><h2>Payment & delivery settings</h2><div className="form-row"><label>Bank name<input required value={settings.bank_name} onChange={(event) => setSettings({ ...settings, bank_name: event.target.value })} /></label><label>Account name<input required value={settings.account_name} onChange={(event) => setSettings({ ...settings, account_name: event.target.value })} /></label></div><div className="form-row"><label>Account number<input required inputMode="numeric" pattern="[0-9]{10}" value={settings.account_number} onChange={(event) => setSettings({ ...settings, account_number: event.target.value })} /></label><label>Delivery fee (₦)<input required type="number" min="0" value={settings.delivery_fee} onChange={(event) => setSettings({ ...settings, delivery_fee: Number(event.target.value) })} /></label></div><button className="button button-dark" disabled={busy}>Save payment details <Icon name="check" size={17} /></button></form>
    <form className="form-page-card stack-form admin-add-form" onSubmit={(event) => void saveProduct(event)}><h2>Add a shop listing</h2><div className="form-row"><label>Item name<input name="name" required maxLength={100} /></label><label>Brand / label<input name="seller_name" required /></label></div><div className="form-row"><label>Category<select name="category" defaultValue="Clothing"><option>Clothing</option><option>Bags</option><option>Accessories</option></select></label><label>Price (₦)<input name="price" type="number" min="1" required /></label></div><div className="form-row"><label>Available quantity<input name="stock" type="number" min="0" required /></label><label>Colour / size<input name="color" required /></label></div><label>Description<textarea name="description" rows={3} /></label><label className="upload-field">Product photo<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" /><span className="upload-prompt"><Icon name="upload" size={18} /> Add a product photo (optional)</span></label><button className="button button-dark" disabled={busy}>Add listing <Icon name="plus" size={17} /></button></form>
    <section className="admin-section"><h2>Shop inventory <span>{products.length}</span></h2>{products.map((product) => <InventoryRow key={product.id} product={product} onSave={async (stock, status) => { const { error: resultError } = await requireSupabase().from('products').update({ stock, status }).eq('id', product.id); if (resultError) setError(resultError.message); else await loadAdminData() }} />)}</section>
    <section className="admin-section"><h2>Orders & payment proof <span>{orders.length}</span></h2>{orders.length ? orders.map((order) => <article className="admin-record" key={order.id}><div><b>{order.order_number} · {order.customer_name}</b><small>{order.customer_email} · {order.phone} · {formatDate(order.created_at)}</small><small>{order.delivery_address}</small><small>{order.order_items?.map((item) => `${item.product_name} × ${item.quantity}`).join(', ')}</small><strong>{formatMoney(order.total)}</strong></div><div className="admin-record-actions"><span className={`order-status ${order.status === 'confirmed' ? 'confirmed' : ''}`}>{order.status.replace('_', ' ')}</span>{order.proof_path && <button className="text-link" onClick={() => void viewProof(order.proof_path!)}>View proof</button>}{order.status === 'awaiting_review' && <><button className="admin-confirm" disabled={busy} onClick={() => void reviewOrder(order.id, true)}>Confirm payment</button><button className="admin-reject" disabled={busy} onClick={() => void reviewOrder(order.id, false)}>Reject</button></>}</div></article>) : <p className="muted-copy">No customer orders yet.</p>}</section>
    {proofUrl && <div className="proof-preview" onClick={() => setProofUrl('')}><button className="icon-button" aria-label="Close preview"><Icon name="close" /></button>{new URL(proofUrl).pathname.endsWith('.pdf') ? <iframe title="Payment proof" src={proofUrl} /> : <img src={proofUrl} alt="Customer payment proof" />}</div>}
  </PageFrame>
}

function InventoryRow({ product, onSave }: { product: Product; onSave: (stock: number, status: Product['status']) => Promise<void> }) {
  const [stock, setStock] = useState(product.stock)
  const [status, setStatus] = useState(product.status)
  return <div className="inventory-row">{product.image_url && <img src={product.image_url} alt="" />}<div className="inventory-name"><b>{product.name}</b><small>{product.category} · {formatMoney(product.price)}</small></div><label>Stock<input aria-label={`${product.name} stock`} type="number" min="0" value={stock} onChange={(event) => setStock(Number(event.target.value))} /></label><label>Status<select value={status} onChange={(event) => setStatus(event.target.value as Product['status'])}><option value="active">Active</option><option value="hidden">Hidden</option></select></label><button className="admin-confirm" onClick={() => void onSave(stock, status)}>Save</button></div>
}

function Footer() {
  return <footer className="site-footer"><div className="footer-main"><div className="footer-brand"><Link className="wordmark footer-wordmark" to="/">common<span>thread</span><i>.</i></Link><p>A good thing going around.<br />Made with love in Lagos.</p></div><div className="footer-links"><div><span>Have a look</span><Link to="/">Shop all</Link><Link to="/?category=Clothing">Clothing</Link><Link to="/?category=Bags">Bags & more</Link></div><div><span>Common Thread</span><Link to="/#story">Our story</Link><Link to="/admin/login">Admin sign in</Link></div><div><span>Need a hand?</span><a href="mailto:hello@commonthread.ng">Get in touch</a><Link to="/account">Your orders</Link></div></div></div><div className="footer-bottom"><span>© 2026 Common Thread Marketplace</span><span>Good clothes, good people, good things.</span><Link to="/#top">Back to the top ↑</Link></div></footer>
}

function PageFrame({ children }: { children: ReactNode }) { return <main className="page-frame">{children}</main> }
function PageLoading() { return <div className="page-loading" role="status">Loading your Common Thread…</div> }
function ErrorBanner({ message }: { message: string }) { return <div className="error-banner" role="alert">{message}</div> }
function EmptyState({ title, text, action, to }: { title: string; text: string; action: string; to: string }) { return <div className="empty-page-state"><span className="note-star">✳</span><h2>{title}</h2><p>{text}</p><Link className="button button-dark" to={to}>{action} <Icon name="arrow" size={18} /></Link></div> }
function NotFoundPage() { return <PageFrame><EmptyState title="We can’t find that page." text="Let’s get you back to the good stuff." action="Back to the shop" to="/" /></PageFrame> }

export default App
