import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  PackageCheck,
  ShoppingBag
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { sendJson } from "./api.js";
import ProductArt from "./ProductArt.jsx";
import { formatPrice } from "./cart.js";

export default function CheckoutPage({
  user,
  cart,
  productsById,
  cartNotice,
  initialAddress,
  onBack,
  onContinue
}) {
  const [deliveryAddress, setDeliveryAddress] = useState(initialAddress);
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState("");
  const [addressError, setAddressError] = useState("");
  const [retry, setRetry] = useState(0);
  const backButton = useRef(null);
  const addressInput = useRef(null);

  useEffect(() => {
    backButton.current.focus();
  }, []);

  useEffect(() => {
    let active = true;

    if (!cart.length) return;
    sendJson("/api/cart/validate", "POST", { items: cart })
      .then((data) => {
        if (!active) return;
        setQuote(data);
        setError("");
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      });

    return () => {
      active = false;
    };
  }, [cart, retry]);

  function continueToPayment(event) {
    event.preventDefault();
    if (!cart.length || !quote?.valid || error) return;

    const address = deliveryAddress.trim();

    const invalidAddress = address.length < 5
      ? "Enter a delivery address of at least 5 characters."
      : address.length > 300
        ? "Delivery address must be 300 characters or fewer."
        : "";
    if (invalidAddress) {
      setAddressError(invalidAddress);
      addressInput.current.focus();
      return;
    }

    setAddressError("");

    onContinue({
      deliveryAddress: address,
      totalCents: quote.subtotalCents
    });
  }

  return (
    <main className="checkout-page">
      <div className="page-container checkout-shell">
        <button
          type="button"
          className="login-back"
          ref={backButton}
          onClick={() => onBack(deliveryAddress)}
        >
          <ArrowLeft size={18} />
          Back to bag
        </button>

        <div className="checkout-heading">
          <div>
            <p className="eyebrow">SECURE CHECKOUT</p>
            <h1>Review your delivery</h1>
            <p>
              Confirm your products and delivery address before payment.
            </p>
          </div>

          <ol className="checkout-step" aria-label="Checkout progress">
            <li aria-current="step">Delivery</li>
            <li>Payment</li>
          </ol>
        </div>

        {cartNotice && <p className="cart-adjustment" role="status">{cartNotice}</p>}

        {!cart.length && (
          <p className="checkout-state" role="status">Your bag is empty. Add a product before checking out.</p>
        )}

        {cart.length > 0 && !quote && !error && (
          <div className="checkout-state" role="status">
            Checking current prices and stock…
          </div>
        )}

        {error && (
          <div
            className="checkout-state checkout-state--error"
            role="alert"
          >
            <p>{error}</p>
            <button type="button" className="outline-button" onClick={() => {
              setError("");
              setRetry((current) => current + 1);
            }}>Try again</button>
          </div>
        )}

        {cart.length > 0 && !error && quote && (
          <form
            className="checkout-grid"
            onSubmit={continueToPayment}
            noValidate
          >
            <section
              className="checkout-card"
              aria-labelledby="delivery-title"
            >
              <div className="checkout-card-title">
                <MapPin size={20} />

                <div>
                  <p className="eyebrow">DELIVERY</p>
                  <h2 id="delivery-title">
                    Where should we send it?
                  </h2>
                </div>
              </div>

              <label className="checkout-field">
                Full delivery address

                <textarea
                  ref={addressInput}
                  value={deliveryAddress}
                  rows={5}
                  autoComplete="street-address"
                  required
                  aria-invalid={Boolean(addressError)}
                  aria-describedby={
                    addressError ? "delivery-error" : undefined
                  }
                  onChange={(event) => {
                    setDeliveryAddress(event.target.value);
                    setAddressError("");
                  }}
                />
              </label>

              {addressError && (
                <p
                  id="delivery-error"
                  className="checkout-error"
                  role="alert"
                >
                  {addressError}
                </p>
              )}

              <p className="checkout-help">
                <CheckCircle2 size={15} />
                Signed in as {user.name}
              </p>
            </section>

            <aside
              className="checkout-card order-summary"
              aria-labelledby="summary-title"
            >
              <div className="checkout-card-title">
                <ShoppingBag size={20} />

                <div>
                  <p className="eyebrow">YOUR BAG</p>
                  <h2 id="summary-title">Order summary</h2>
                </div>
              </div>

              <div className="checkout-items">
                {quote.items.map((line) => {
                  const product = productsById[line.productId];

                  return (
                    <div
                      className="checkout-item"
                      key={line.productId}
                    >
                      {product && (
                        <ProductArt
                          product={product}
                          variant="mini"
                        />
                      )}

                      <div>
                        <strong>
                          {line.name ||
                            product?.name ||
                            line.productId}
                        </strong>

                        <span>Quantity {line.quantity}</span>

                        {!line.available && (
                          <small>{line.reason}</small>
                        )}
                      </div>

                      <b>
                        {line.unitPriceCents === null ? "—" : formatPrice(line.lineTotalCents)}
                      </b>
                    </div>
                  );
                })}
              </div>

              <div className="checkout-total">
                <span>Total</span>
                <strong>
                  {formatPrice(quote.subtotalCents)}
                </strong>
              </div>

              {!quote.valid && (
                <p
                  className="checkout-error"
                  role="alert"
                >
                  Update your bag before continuing. One or more
                  products are unavailable.
                </p>
              )}

              <button
                className="primary-button wide"
                type="submit"
                disabled={!quote.valid || !cart.length}
              >
                Continue to payment
                <PackageCheck size={18} />
              </button>
            </aside>
          </form>
        )}
      </div>
    </main>
  );
}
