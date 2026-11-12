export async function fetchJson(url, options) {
  const response = await fetch(url, { credentials: "include", ...options });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Something went wrong.");
    error.status = response.status;
    throw error;
  }
  return data;
}

export function sendJson(url, method, data) {
  return fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
}
