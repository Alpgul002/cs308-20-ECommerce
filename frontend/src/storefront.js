import { useEffect, useState } from "react";
import { fetchJson } from "./api.js";

export const DEFAULT_FILTERS = { search: "", category: "all", sort: "popular", minPrice: "", maxPrice: "", inStock: false };

export function readLocation() {
  const params = new URLSearchParams(window.location.search);
  const filters = Object.fromEntries(Object.entries(DEFAULT_FILTERS).map(([key, value]) =>
    [key, key === "inStock" ? params.get(key) === "true" : params.get(key) ?? value]));
  return { filters, productId: params.get("product") };
}

export function useStoreLocation() {
  const [location, setLocation] = useState(readLocation);
  useEffect(() => {
    const onPop = () => setLocation(readLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function write(next, push) {
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(next.filters)) {
      if (value === DEFAULT_FILTERS[key]) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    if (next.productId) url.searchParams.set("product", next.productId);
    else url.searchParams.delete("product");
    if (push) url.hash = "";
    window.history[push ? "pushState" : "replaceState"]({}, "", url);
    setLocation(next);
  }
  return {
    ...location,
    setFilters: (update) => write({ ...location, filters: { ...location.filters, ...update } }, false),
    openProduct: (productId) => write({ ...location, productId }, true)
  };
}

export function productQuery(filters) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== "" && value !== false)).toString();
}

// A response belongs to its URL, never to whichever screen happens to be open later.
// Cleanup handles both rapid filter changes and React StrictMode's extra effect cycle.
export function useRemote(url, retry = 0, delay = 0) {
  const [state, setState] = useState({ url: null, data: null, error: null, loading: true });
  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let active = true;
    setState({ url, data: null, error: null, loading: true });
    const timer = setTimeout(() => {
      fetchJson(url, { signal: controller.signal })
        .then((data) => { if (active) setState({ url, data, error: null, loading: false }); })
        .catch((error) => { if (active) setState({ url, data: null, error, loading: false }); });
    }, delay);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [url, retry, delay]);
  return url && state.url === url ? state : { data: null, error: null, loading: Boolean(url) };
}
