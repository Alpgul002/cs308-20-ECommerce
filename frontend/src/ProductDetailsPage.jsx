import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ShoppingBag
  } from "lucide-react";
  import ProductArt from "./ProductArt.jsx";
  import { formatPrice } from "./cart.js";
  
  export default function ProductDetailsPage({ product, onBack, onAdd }) {
    const soldOut = product.stock === 0;
  
    return (
      <main className="product-page">
        <div className="page-container">
          <button type="button" className="product-page-back" onClick={onBack}>
            <ArrowLeft size={18} />
            Back to products
          </button>
  
          <section className="product-page-card">
            <ProductArt product={product} variant="detail" />
  
            <div className="detail-content">
              <p className="eyebrow">
                {product.brand} / {product.categoryName}
              </p>
  
              <h1>{product.name}</h1>
              <p className="detail-price">{formatPrice(product.priceCents)}</p>
              <p className="detail-description">{product.description}</p>
  
              <div className="detail-stock">
                {soldOut
                  ? <AlertTriangle size={17} />
                  : <CheckCircle2 size={17} />}
                {soldOut
                  ? "Currently out of stock"
                  : `${product.stock} pieces available`}
              </div>
  
              <dl className="spec-grid">
                <div>
                  <dt>Product ID</dt>
                  <dd>{product.id}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{product.model}</dd>
                </div>
                <div>
                  <dt>Serial number</dt>
                  <dd>{product.serialNumber}</dd>
                </div>
                <div>
                  <dt>Warranty</dt>
                  <dd>
                    {product.warrantyStatus} · {product.warrantyMonths} months
                  </dd>
                </div>
                <div>
                  <dt>Distributor</dt>
                  <dd>{product.distributor}</dd>
                </div>
                <div>
                  <dt>Quantity in stock</dt>
                  <dd>{product.stock}</dd>
                </div>
              </dl>
  
              <button
                type="button"
                className="primary-button wide"
                disabled={soldOut}
                onClick={() => onAdd(product)}
              >
                {soldOut ? (
                  "Out of stock"
                ) : (
                  <>
                    <ShoppingBag size={19} />
                    Add to bag
                  </>
                )}
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }