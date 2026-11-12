import { useEffect, useState } from "react";
import { fetchJson } from "./api.js";

function money(cents, currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function PaymentHistory() {
  const [payments, setPayments] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    fetchJson("/api/account/payments")
      .then((data) => { if (active) setPayments(data.payments); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);

  return (
    <section className="shop-panel" aria-labelledby="payments-title">
      <h2 id="payments-title">Payment history</h2>
      {error && <p role="alert">{error}</p>}
      {!payments && !error && <p role="status">Loading payments…</p>}
      {payments?.length === 0 && <p>No payment records yet.</p>}
      {payments?.map((payment) => (
        <article className="shop-record" key={payment.id}>
          <h3>Order #{payment.orderId}</h3>
          <p>{money(payment.amountCents, payment.currency)} · {payment.status} ·{" "}
            <time dateTime={payment.createdAt}>{new Date(payment.createdAt).toLocaleDateString()}</time>
          </p>
          <ul>
            {payment.items.map((item) => (
              <li key={item.productId}>
                {item.quantity} × {item.name} · {money(item.unitPriceCents, payment.currency)} each
              </li>
            ))}
          </ul>
        </article>
      ))}
    </section>
  );
}
