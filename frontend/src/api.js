export async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch(url, { credentials: "include", cache: "no-store", ...options, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok || data === null) {
      const error = new Error(data?.error || "The server is unavailable. Please try again.");
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error.name === "AbortError") throw new Error("The request timed out. Please try again.");
    if (error instanceof TypeError) throw new Error("Cannot reach the store. Check your connection and try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
  }
}

export function sendJson(url, method, data) {
  return fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}
