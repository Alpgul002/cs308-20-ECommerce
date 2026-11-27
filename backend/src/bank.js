import { HttpError } from "./errors.js";

// Deterministic stand-in for a card processor (PDF item 15: verification is out of scope).
// Any valid card is approved except these test numbers, so demos and tests can show a decline.
export const TEST_CARDS = Object.freeze({
  approved: "4242424242424242",
  declined: "4000000000000002",
  insufficientFunds: "4000000000009995"
});

const DECLINES = new Map([
  [TEST_CARDS.declined, "Card declined"],
  [TEST_CARDS.insufficientFunds, "Insufficient funds"]
]);

function passesLuhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

// Returns only what the bank call needs. Callers must not store the number or CVC (PDF item 17).
export function validateCard(input, now = new Date()) {
  const fields = {};
  const number = typeof input?.cardNumber === "string" ? input.cardNumber.replace(/[\s-]/g, "") : "";
  if (!/^[0-9]{12,19}$/.test(number) || !passesLuhn(number)) fields.cardNumber = "Enter a valid card number.";

  const holder = typeof input?.cardHolder === "string" ? input.cardHolder.trim() : "";
  if (holder.length < 2 || holder.length > 100) fields.cardHolder = "Enter the name on the card.";

  const { expiryMonth: month, expiryYear: year } = input ?? {};
  const validMonth = Number.isInteger(month) && month >= 1 && month <= 12;
  const validYear = Number.isInteger(year) && year >= 2000 && year <= 2100;
  if (!validMonth || !validYear) {
    fields.expiry = "Enter the expiry month and year.";
  } else if (year * 12 + month < now.getUTCFullYear() * 12 + now.getUTCMonth() + 1) {
    fields.expiry = "This card has expired.";
  }

  if (typeof input?.cvc !== "string" || !/^[0-9]{3,4}$/.test(input.cvc)) fields.cvc = "Enter the 3 or 4 digit security code.";

  if (Object.keys(fields).length) throw new HttpError(400, "Please check the payment details.", fields);
  return { number, last4: number.slice(-4) };
}

export function createMockBank() {
  return {
    charge({ card }) {
      const declineReason = DECLINES.get(card.number);
      return declineReason ? { approved: false, declineReason } : { approved: true, cardLast4: card.last4 };
    }
  };
}
