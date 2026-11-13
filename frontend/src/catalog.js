// Sorting a filtered copy preserves the catalog shared with the cart.
export function filterProducts(products, { search = "", category = "all", sort = "popular" } = {}) {
  const needle = search.trim().toLowerCase();
  const result = products.filter((product) =>
    (category === "all" || product.categorySlug === category) &&
    (!needle || `${product.name} ${product.description}`.toLowerCase().includes(needle)));
  const byName = (a, b) => a.name.localeCompare(b.name);
  return result.sort((a, b) => {
    if (sort === "price-asc") return a.priceCents - b.priceCents || byName(a, b);
    if (sort === "price-desc") return b.priceCents - a.priceCents || byName(a, b);
    if (sort === "name") return byName(a, b);
    return b.popularity - a.popularity || byName(a, b);
  });
}
