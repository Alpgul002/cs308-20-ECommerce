import { describe, expect, it } from "vitest";
import {
  addItem, countItems, formatPrice, normalizeCart, removeItem,
  setItemQuantity, subtotalCents
} from "./cart.js";

const headphones = { id: "p-101", name: "Studio Headphones", stock: 5, priceCents: 12999 };
const camera = { id: "p-109", name: "Mirrorless Camera", stock: 0, priceCents: 84999 };

describe("guest shopping bag", () => {
  it("starts from empty invalid storage", () => expect(normalizeCart(null)).toEqual([]));
  it("keeps a valid saved bag", () => expect(normalizeCart([{ productId: "p-101", quantity: 2 }])).toEqual([{ productId: "p-101", quantity: 2 }]));
  it("discards duplicate saved IDs", () => expect(normalizeCart([{ productId: "p-101", quantity: 1 }, { productId: "p-101", quantity: 2 }])).toHaveLength(1));
  it("discards invalid saved quantities", () => expect(normalizeCart([{ productId: "p-101", quantity: -1 }])).toEqual([]));
  it("discards suspicious saved IDs", () => expect(normalizeCart([{ productId: "' OR 1=1 --", quantity: 1 }])).toEqual([]));
  it("adds a new product", () => expect(addItem([], headphones)).toEqual([{ productId: "p-101", quantity: 1 }]));
  it("increments an existing product", () => expect(addItem([{ productId: "p-101", quantity: 1 }], headphones)[0].quantity).toBe(2));
  it("cannot add out of stock products", () => expect(addItem([], camera)).toEqual([]));
  it("does not exceed stock", () => {
    const cart = [{ productId: "p-101", quantity: 5 }];
    expect(addItem(cart, headphones)).toBe(cart);
  });
  it("limits changed quantities to stock", () => expect(setItemQuantity([{ productId: "p-101", quantity: 1 }], "p-101", 8, 5)[0].quantity).toBe(5));
  it("removes an item when its quantity reaches zero", () => expect(setItemQuantity([{ productId: "p-101", quantity: 1 }], "p-101", 0, 5)).toEqual([]));
  it("removes only selected item", () => expect(removeItem([{ productId: "p-101", quantity: 1 }, { productId: "p-109", quantity: 1 }], "p-101")).toHaveLength(1));
  it("counts total pieces rather than distinct items", () => expect(countItems([{ productId: "p-101", quantity: 3 }])).toBe(3));
  it("calculates subtotal without floating point", () => expect(subtotalCents([{ productId: "p-101", quantity: 3 }], { "p-101": headphones })).toBe(38997));
  it("formats cents as dollars", () => expect(formatPrice(12999)).toBe("$129.99"));
});
