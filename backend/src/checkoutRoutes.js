import { Router } from "express";
import { ROLES } from "./auth.js";
import { IDEMPOTENCY_KEY_PATTERN, placeOrder } from "./checkout.js";
import { validateCard } from "./bank.js";
import { HttpError } from "./errors.js";
import { requireRole } from "./middleware.js";
import { getOrder } from "./orders.js";

function deliveryAddressFor(req) {
  const given = req.body?.deliveryAddress;
  if (given !== undefined && typeof given !== "string") {
    throw new HttpError(400, "Please check the delivery address.", { deliveryAddress: "Enter a delivery address." });
  }
  const address = (given ?? req.user.homeAddress ?? "").trim();
  if (address.length < 5 || address.length > 300) {
    throw new HttpError(400, "Please check the delivery address.", { deliveryAddress: "Enter a delivery address." });
  }
  return address;
}

// PDF items 3 and 4: only a signed-in customer can pay, and the order starts as processing.
export function createCheckoutRouter(db, bank) {
  const router = Router();

  router.post("/", requireRole(ROLES.CUSTOMER), (req, res) => {
    res.set("Cache-Control", "no-store");
    const idempotencyKey = req.get("Idempotency-Key");
    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey ?? "")) {
      throw new HttpError(400, "Send a unique Idempotency-Key header (8-100 letters, digits, - or _) with each payment attempt.");
    }
    const expectedTotalCents = req.body?.expectedTotalCents;
    if (expectedTotalCents !== undefined && !Number.isSafeInteger(expectedTotalCents)) {
      throw new HttpError(400, "expectedTotalCents must be a whole number of cents.");
    }
    const deliveryAddress = deliveryAddressFor(req);
    const card = validateCard(req.body?.payment);

    let result;
    try {
      result = placeOrder(db, {
        userId: req.user.id,
        idempotencyKey,
        customerName: req.user.name,
        deliveryAddress,
        expectedTotalCents,
        charge: ({ amountCents }) => bank.charge({ amountCents, card })
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      // Everything was rolled back, so nothing was bought and the same key can be retried.
      console.error(error);
      throw new HttpError(503, "The payment could not be completed. You have not been charged; please try again.");
    }

    if (result.outcome === "declined") {
      throw new HttpError(402, `Payment declined: ${result.declineReason}.`, undefined, {
        code: "payment_declined", replayed: result.replayed
      });
    }
    const { order } = getOrder(db, result.orderId);
    res.status(result.replayed ? 200 : 201).json({ order, replayed: result.replayed });
  });

  return router;
}
