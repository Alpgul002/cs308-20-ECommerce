import { describe, expect, it } from "vitest";
import { filterProducts } from "./catalog.js";

const products = [
  { id: "p-101", name: "Headphones", description: "Wireless audio", categorySlug: "audio", priceCents: 200, popularity: 2, stock: 4 },
  { id: "p-102", name: "Camera", description: "Travel photography", categorySlug: "photo", priceCents: 500, popularity: 3, stock: 0 },
  { id: "p-103", name: "Speaker", description: "Wireless audio", categorySlug: "audio", priceCents: 100, popularity: 1, stock: 5 }
];
const ids = (options) => filterProducts(products, options).map((p) => p.id);

describe("catalog search and filters", () => {
  it("searches names regardless of case and surrounding spaces", () => expect(ids({ search: " CAMERA " })).toEqual(["p-102"]));
  it("searches descriptions", () => expect(ids({ search: "travel" })).toEqual(["p-102"]));
  it("combines category and search", () => expect(ids({ category: "photo", search: "wireless" })).toEqual([]));
  it("sorts filtered results by ascending price", () => expect(ids({ category: "audio", sort: "price-asc" })).toEqual(["p-103", "p-101"]));
  it("sorts descending prices", () => expect(ids({ sort: "price-desc" })).toEqual(["p-102", "p-101", "p-103"]));
  it("sorts by popularity by default", () => expect(ids({})).toEqual(["p-102", "p-101", "p-103"]));
  it("keeps sold-out products searchable", () => expect(filterProducts(products, { search: "camera" })[0].stock).toBe(0));
  it("does not mutate the original catalog", () => {
    filterProducts(products, { sort: "name" });
    expect(products.map((p) => p.id)).toEqual(["p-101", "p-102", "p-103"]);
  });
});
