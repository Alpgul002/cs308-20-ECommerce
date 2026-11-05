import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight,
  Minus, PackageCheck, Plus, Search, ShieldCheck, ShoppingBag,
  SlidersHorizontal, Sparkles, Trash2, Truck, X
} from "lucide-react";
import { filterProducts } from "./catalog.js";
import ProductArt from "./ProductArt.jsx";
import ProductDetailsPage from "./ProductDetailsPage.jsx";
import LoginPage from "./LoginPage.jsx";
import {
  STORAGE_KEY, addItem, countItems, formatPrice, normalizeCart,
  removeItem, setItemQuantity, subtotalCents
} from "./cart.js";

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function initialCart() {
  try {
    return normalizeCart(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"));
  } catch {
    return [];
  }
}

function SectionTitle({ eyebrow, title, children }) {
  return (
    <div className="section-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ProductCard({ product, onAdd, onDetails }) {
  const soldOut = product.stock === 0;
  return (
    <article className="product-card">
      <button className="product-image-button" onClick={() => onDetails(product)}
        aria-label={`View ${product.name} details`}>
        <ProductArt product={product} />
        <span className={`stock-tag ${soldOut ? "stock-tag--out" : ""}`}>
          {soldOut ? "Sold out" : `${product.stock} in stock`}
        </span>
      </button>
      <div className="product-card-body">
        <p className="product-category">{product.brand} · {product.categoryName}</p>
        <button className="product-name" onClick={() => onDetails(product)}>{product.name}</button>
        <p className="product-description">{product.description}</p>
        <div className="product-footer">
          <span className="price">{formatPrice(product.priceCents)}</span>
          <button className="add-button" onClick={() => onAdd(product)} disabled={soldOut}
            aria-label={soldOut ? `${product.name} is out of stock` : `Add ${product.name} to cart`}>
            {soldOut ? "Unavailable" : <><Plus size={17} /> Add</>}
          </button>
        </div>
      </div>
    </article>
  );
}

function ProductDialog({ product, onClose, onAdd }) {
  return (
    <div className="overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section role="dialog" aria-modal="true" aria-labelledby="product-dialog-title"
        className="product-dialog">
        <button className="icon-button dialog-close" onClick={onClose} aria-label="Close product details">
          <X size={20} />
        </button>
        <ProductArt product={product} variant="detail" />
        <div className="detail-content">
          <p className="eyebrow">{product.brand} / {product.categoryName}</p>
          <h2 id="product-dialog-title">{product.name}</h2>
          <p className="detail-price">{formatPrice(product.priceCents)}</p>
          <p className="detail-description">{product.description}</p>
          <div className="detail-stock">
            {product.stock > 0 ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            {product.stock > 0 ? `${product.stock} pieces available` : "Currently out of stock"}
          </div>
          <dl className="spec-grid">
            <div><dt>Model</dt><dd>{product.model}</dd></div>
            <div><dt>Serial number</dt><dd>{product.serialNumber}</dd></div>
            <div><dt>Warranty</dt><dd>{product.warrantyStatus} · {product.warrantyMonths} months</dd></div>
            <div><dt>Distributor</dt><dd>{product.distributor}</dd></div>
          </dl>
          <button className="primary-button wide" disabled={product.stock === 0}
            onClick={() => onAdd(product)}>
            {product.stock === 0 ? "Out of stock" : <><ShoppingBag size={19} /> Add to bag <ArrowRight size={18} /></>}
          </button>
        </div>
      </section>
    </div>
  );
}

function CartDrawer({
  cart, productsById, quote, checking,
  onClose, onReview, onQuantity, onRemove, onDetails
}) {
  return (
    <div className="overlay drawer-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="cart-drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="drawer-header">
          <div>
            <p className="eyebrow">Your collection</p>
            <h2 id="cart-title">Shopping bag <span>({countItems(cart)})</span></h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close shopping bag"><X size={22} /></button>
        </div>
        {cart.length === 0 ? (
          <div className="empty-bag">
            <ShoppingBag size={44} strokeWidth={1.2} />
            <h3>Your bag is empty</h3>
            <p>Discover something worth keeping.</p>
            <button className="primary-button" onClick={onClose}>Explore products <ArrowRight size={17} /></button>
          </div>
        ) : (
          <>
            <div className="bag-items">
              {cart.map((item) => {
                const product = productsById[item.productId];
                if (!product) return (
                  <div className="bag-item" key={item.productId}>
                    <p>This product is no longer in the catalog.</p>
                    <button className="text-action" onClick={() => onRemove(item.productId)}>Remove</button>
                  </div>
                );
                return (
                  <div className="bag-item" key={item.productId}>
                    <button
                      type="button"
                      className="bag-product-image"
                      onClick={() => onDetails(product)}
                      aria-label={`View ${product.name} details`}
                    >
                      <ProductArt product={product} variant="mini" />
                    </button>
                    <div className="bag-item-info">
                    <button
                      type="button"
                      className="product-name"
                      onClick={() => onDetails(product)}
                    >
                      {product.name}
                    </button>
                      <span>{formatPrice(product.priceCents)}</span>
                      {product.stock < item.quantity && <small className="warning-text">Only {product.stock} available</small>}
                      <div className="quantity-control">
                        <button onClick={() => onQuantity(item.productId, item.quantity - 1, product.stock)}
                          aria-label={`Decrease ${product.name} quantity`}><Minus size={14} /></button>
                        <span>{item.quantity}</span>
                        <button onClick={() => onQuantity(item.productId, item.quantity + 1, product.stock)}
                          disabled={item.quantity >= Math.min(20, product.stock)}
                          aria-label={`Increase ${product.name} quantity`}><Plus size={14} /></button>
                      </div>
                    </div>
                    <button className="icon-button remove-button" onClick={() => onRemove(item.productId)}
                      aria-label={`Remove ${product.name}`}><Trash2 size={17} /></button>
                  </div>
                );
              })}
            </div>
            <div className="bag-bottom">
              <div className="subtotal-line"><span>Subtotal</span><strong>{formatPrice(quote?.subtotalCents ?? subtotalCents(cart, productsById))}</strong></div>
              <p className="bag-note">Shipping and payment will be added in a later sprint.</p>
              {quote && (
                <p role="status" className={`quote-status ${quote.valid ? "quote-status--ok" : "quote-status--warn"}`}>
                  {quote.valid
                    ? "Stock verified by the backend. Checkout is not implemented yet."
                    : "Some items are unavailable. Please adjust your bag."}
                </p>
              )}
              <button className="primary-button wide" onClick={onReview} disabled={checking}>
                {checking ? "Checking availability..." : "Check stock & subtotal"} <ArrowRight size={18} />
              </button>
              <p className="checkout-notice">Guest browsing only · Orders and payments are not active yet</p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState("popular");
  const [cart, setCart] = useState(initialCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [quote, setQuote] = useState(null);
  const [checking, setChecking] = useState(false);
  const cartRevision = useRef(0);

  function invalidateQuote() {
    cartRevision.current += 1;
    setQuote(null);
  }

  useEffect(() => {
    let active = true;
    Promise.all([fetchJson("/api/products"), fetchJson("/api/categories")])
      .then(([catalog, groups]) => {
        if (!active) return;
        setProducts(catalog.products);
        setCategories(groups.categories);
        setLoadError("");
      })
      .catch(() => { if (active) setLoadError("The catalog could not be loaded. Make sure the API is running."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [retry]);

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); } catch { /* Browsing still works with storage disabled. */ }
  }, [cart]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!cartOpen && !details) return;
    const onEscape = (event) => {
      if (event.key === "Escape") { setCartOpen(false); setDetails(null); }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [cartOpen, details]);

  const productsById = useMemo(() => Object.fromEntries(products.map((product) => [product.id, product])), [products]);

  const visibleProducts = useMemo(() => filterProducts(products, { search, category, sort }),
    [products, category, search, sort]);

  function resetFilters() {
    setSearch("");
    setCategory("all");
    setSort("popular");
  }

  function handleAdd(product) {
    const next = addItem(cart, product);
    if (next === cart) {
      setToast(product.stock < 1 ? "This product is out of stock." : "You've reached the available quantity.");
      return;
    }
    setCart(next);
    invalidateQuote();
    setToast(`${product.name} added to your bag.`);
  }

  function handleQuantity(id, quantity, stock) {
    setCart((current) => setItemQuantity(current, id, quantity, stock));
    invalidateQuote();
  }

  function handleRemove(id) {
    setCart((current) => removeItem(current, id));
    invalidateQuote();
  }

  async function reviewCart() {
    const revision = cartRevision.current;
    setChecking(true);
    setQuote(null);
    try {
      const result = await fetchJson("/api/cart/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: cart })
      });
      if (revision !== cartRevision.current) return;
      setQuote(result);
      setProducts((current) => current.map((product) => {
        const line = result.items.find((item) => item.productId === product.id);
        return line && line.unitPriceCents !== null
          ? { ...product, priceCents: line.unitPriceCents, stock: line.stock }
          : product;
      }));
    } catch (error) {
      if (revision === cartRevision.current) setToast(error.message);
    } finally {
      setChecking(false);
    }
  }

  const featured = products.find((product) => product.id === "p-101") || { imageKey: "headphones", accent: "violet", name: "Studio Headphones", priceCents: 12999 };
  if (loginOpen) {
    return (
      <LoginPage
        onBack={() => setLoginOpen(false)}
        onSubmit={() => {
          setLoginOpen(false);
          setToast("Sign-in is temporarily unavailable. Your bag is still saved.");
        }}
      />
    );
  }
  if (details) {
    return (
      <>
      <ProductDetailsPage
        product={details}
        onBack={() => setDetails(null)}
        onAdd={handleAdd}
      />
      {toast && <div className="toast" role="status">{toast}<button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={16} /></button></div>}
      </>
    );
  }
  return (
    <>
      <div className="announcement"><Sparkles size={14} /> A better way to browse your next favorite gadget <ArrowUpRight size={14} /></div>
      <header className="site-header">
        <div className="page-container nav-content">
          <a className="brand" href="#top" aria-label="Orbit Store home">
            <span className="brand-symbol"><span /><span /><span /><span /></span>
            <span>orbit<span className="brand-period">.</span></span>
            <span className="brand-store">STORE</span>
          </a>
          <nav className="main-nav" aria-label="Main navigation">
            <a href="#catalog">Shop all</a>
            <a href="#features">Why Orbit</a>
          </nav>
          <div className="header-actions">
            <span className="guest-label"><span className="online-dot" /> Guest browsing</span>
            <button
              type="button"
              className="login-trigger"
              onClick={() => setLoginOpen(true)}
            >
              Sign in
            </button>
            <button className="cart-trigger" onClick={() => setCartOpen(true)} aria-label={`Open bag with ${countItems(cart)} items`}>
              <ShoppingBag size={20} /> <span>Bag</span>
              <span className="cart-count">{countItems(cart)}</span>
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <div className="page-container">
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-text">
              <span className="hero-kicker"><span /> THE EVERYDAY EDIT — 2026</span>
              <h1 id="hero-title">Tech that makes <em>every day</em> better.</h1>
              <p>Thoughtful picks for the things you do, the places you go, and everything in between.</p>
              <a className="hero-cta" href="#catalog">Explore collection <ArrowUpRight size={19} /></a>
              <div className="hero-indicator"><span className="hero-indicator-active" /><span /><span /> <small>01 — CURATED ESSENTIALS</small></div>
            </div>
            <div className="hero-visual">
              <div className="hero-ring" />
              <ProductArt product={featured} variant="hero" />
              <div className="hero-product-label"><span>FEATURED PICK</span><strong>{featured.name}</strong><small>{formatPrice(featured.priceCents)}</small></div>
              <span className="hero-side-text">DESIGNED FOR WHAT'S NEXT</span>
            </div>
          </section>

          <section className="value-strip" id="features" aria-label="Store benefits">
            <div><span className="value-icon"><PackageCheck size={22} /></span><span><strong>Curated collection</strong><small>The essentials, thoughtfully picked.</small></span></div>
            <div><span className="value-icon"><ShieldCheck size={22} /></span><span><strong>Transparent stock</strong><small>See what's available as you browse.</small></span></div>
            <div><span className="value-icon"><Truck size={22} /></span><span><strong>Built for real shopping</strong><small>Orders and delivery coming in later sprints.</small></span></div>
          </section>

          <section className="catalog-section" id="catalog" aria-labelledby="catalog-heading">
            <SectionTitle eyebrow="FIND YOUR NEXT FAVORITE" title="Explore the collection">
              <div className="catalog-count"><span className="count-dot" /> {visibleProducts.length} products</div>
            </SectionTitle>

            <div className="filter-toolbar">
              <div className="category-list" aria-label="Product categories">
                <button className={category === "all" ? "category-chip selected" : "category-chip"}
                  aria-pressed={category === "all"} onClick={() => setCategory("all")}>
                  All products <span>{products.length}</span>
                </button>
                {categories.map((group) => (
                  <button key={group.slug}
                    className={category === group.slug ? "category-chip selected" : "category-chip"}
                    aria-pressed={category === group.slug} onClick={() => setCategory(group.slug)}>
                    {group.name} <span>{group.productCount}</span>
                  </button>
                ))}
              </div>
              <div className="search-sort">
                <label className="search-field">
                  <Search size={18} />
                  <span className="sr-only">Search product name or description</span>
                  <input value={search} onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search products..." type="search" />
                </label>
                <label className="sort-field"><SlidersHorizontal size={17} />
                  <span className="sr-only">Sort products</span>
                  <select value={sort} onChange={(event) => setSort(event.target.value)}>
                    <option value="popular">Most popular</option>
                    <option value="price-asc">Price: low to high</option>
                    <option value="price-desc">Price: high to low</option>
                    <option value="name">Name: A to Z</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="filter-summary" role="status">
              <span>{visibleProducts.length} of {products.length} products
                {search.trim() && ` matching “${search.trim()}”`}</span>
              {(search || category !== "all" || sort !== "popular") &&
                <button className="text-action" onClick={resetFilters}>Reset filters</button>}
            </div>

            {loading ? (
              <div className="product-grid" aria-label="Loading products">
                {Array.from({ length: 6 }, (_, index) => <div className="skeleton-card" key={index}><div /><span /><span /></div>)}
              </div>
            ) : loadError ? (
              <div className="empty-results"><AlertTriangle size={34} /><h3>Connection unavailable</h3><p>{loadError}</p><button className="outline-button" onClick={() => { setLoading(true); setRetry((n) => n + 1); }}>Try again</button></div>
            ) : visibleProducts.length ? (
              <div className="product-grid">
                {visibleProducts.map((product) =>
                  <ProductCard key={product.id} product={product} onDetails={setDetails} onAdd={handleAdd} />
                )}
              </div>
            ) : (
              <div className="empty-results">
                <Search size={32} /><h3>No matches this time</h3>
                <p>Try another search or browse our full collection.</p>
                <button className="outline-button" onClick={resetFilters}>Clear filters <ChevronRight size={16} /></button>
              </div>
            )}
          </section>

          <section className="bottom-banner">
            <div><span className="eyebrow">YOUR BAG, YOUR PACE</span><h2>Found something you love?</h2><p>Add products to your bag without an account. Your selection stays in this browser.</p></div>
            <button className="banner-button" onClick={() => setCartOpen(true)}>View your bag <ArrowRight size={19} /></button>
          </section>
        </div>
      </main>
      <footer className="site-footer">
        <div className="page-container footer-inner">
          <span className="footer-logo">orbit<span>.</span> <small>STORE</small></span>
          <span>CS308 Software Engineering · Course project prototype</span>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}<button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={16} /></button></div>}
      {cartOpen && <CartDrawer
      cart={cart}
      productsById={productsById}
      quote={quote}
      checking={checking}
      onClose={() => setCartOpen(false)}
      onReview={reviewCart}
      onQuantity={handleQuantity}
      onRemove={handleRemove}
      onDetails={(product) => {
        setCartOpen(false);
        setDetails(product);
      }}
/>}
      {details && <ProductDialog product={details} onClose={() => setDetails(null)}
        onAdd={handleAdd} />}
    </>
  );
}
