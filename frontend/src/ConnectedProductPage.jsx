import { useEffect, useState } from "react";
import ProductDetailsPage from "./ProductDetailsPage.jsx";
import { useRemote } from "./storefront.js";
import Scrum12Scope from "./Scrum12Scope.jsx";

export default function ConnectedProductPage({ productId, onLoaded, onBack, ...props }) {
  const [retry, setRetry] = useState(0);
  const result = useRemote(`/api/products/${encodeURIComponent(productId)}`, retry);
  useEffect(() => {
    if (result.data) onLoaded(result.data.product);
  }, [result.data, onLoaded]);
  return <>
    <Scrum12Scope section="detail" />
    {result.loading ? <main className="page-container empty-results" role="status"><h1>Loading product...</h1><button className="outline-button" onClick={onBack}>Back to products</button></main>
      : result.error ? <main className="page-container empty-results" role="alert">
        <h1>{result.error.status === 404 ? "Product not found" : "Product unavailable"}</h1>
        <p>{result.error.status === 404 ? "This product may have been removed from the store." : result.error.message}</p>
        <div className="detail-actions"><button className="outline-button" onClick={onBack}>Back to products</button>
          {result.error.status !== 404 && <button className="primary-button" onClick={() => setRetry((n) => n + 1)}>Try again</button>}</div>
      </main>
      : <ProductDetailsPage {...props} product={result.data.product} onBack={onBack} onRefresh={() => setRetry((n) => n + 1)} />}
  </>;
}
