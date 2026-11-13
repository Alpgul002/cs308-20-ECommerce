import { SORT_OPTIONS } from "./catalog.js";
import { HttpError } from "./errors.js";

function price(value) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{1,7}(\.\d{1,2})?$/.test(value)) {
    throw new HttpError(400, "Prices must be nonnegative amounts with at most two decimal places.");
  }
  return Math.round(Number(value) * 100);
}

export function parseCatalogFilters(query) {
  const { search = "", category = "all", sort = "popular", inStock = "false" } = query;
  if (typeof search !== "string" || search.length > 100 ||
      typeof category !== "string" || !/^(all|[a-z-]{1,30})$/.test(category) ||
      typeof sort !== "string" || !Object.hasOwn(SORT_OPTIONS, sort) ||
      !["true", "false"].includes(inStock)) {
    throw new HttpError(400, "Invalid product filters");
  }
  const minPriceCents = price(query.minPrice);
  const maxPriceCents = price(query.maxPrice);
  if (minPriceCents !== undefined && maxPriceCents !== undefined && minPriceCents > maxPriceCents) {
    throw new HttpError(400, "Minimum price cannot exceed maximum price.");
  }
  return { search, category, sort, inStock: inStock === "true", minPriceCents, maxPriceCents };
}
