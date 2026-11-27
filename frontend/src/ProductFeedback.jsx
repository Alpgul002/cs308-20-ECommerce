import { useEffect, useState } from "react";
import { fetchJson, sendJson } from "./api.js";

const ELIGIBILITY_MESSAGES = {
  sign_in_required: "Sign in to review or rate products you have received.",
  purchase_required: "Reviews and ratings are available after a paid purchase is delivered.",
  delivery_required: "You can review and rate this product once your order is delivered.",
  already_reviewed: "You have already reviewed this product."
};

const REVIEW_STATUS_MESSAGES = {
  pending: "Your review is awaiting approval.",
  rejected: "Your review was declined."
};

function LikeButton({ liked, likes, disabled, label, onClick }) {
  return (
    <button type="button" className="text-action" disabled={disabled}
      aria-label={label} aria-pressed={Boolean(liked)} onClick={onClick}>
      {liked ? "Liked" : "Like"} · {likes}
    </button>
  );
}

export default function ProductFeedback({ productId, user, onSignIn }) {
  const url = `/api/products/${productId}/feedback`;
  const [feedback, setFeedback] = useState(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setFeedback(null);
    setError("");
    fetchJson(url)
      .then((data) => { if (active) setFeedback(data); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [url, user?.id]);

  async function update(path, method, data) {
    if (!user) {
      onSignIn();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJson(url + path, method, data);
      if (method === "POST") setBody("");
      setFeedback(await fetchJson(url));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shop-panel" aria-labelledby="feedback-title">
      <h2 id="feedback-title">Reviews</h2>
      {error && <p role="alert">{error}</p>}
      {!feedback && !error && <p role="status">Loading reviews…</p>}
      {feedback && <>
        <LikeButton {...feedback} label="Like this product" disabled={busy}
          onClick={() => update("/like", "PUT", { liked: !feedback.liked })} />
        {feedback.reviews.length === 0 && <p>No published reviews yet.</p>}
        {feedback.reviews.map((review) => (
          <article key={review.id} className="shop-record">
            <strong>{review.author}</strong>
            <p className="review-text">{review.body}</p>
            <LikeButton {...review} label={`Like review by ${review.author}`} disabled={busy}
              onClick={() => update(`/reviews/${review.id}/like`, "PUT", { liked: !review.liked })} />
          </article>
        ))}
        {feedback.canReview && (
          <form className="review-form" onSubmit={(event) => {
            event.preventDefault();
            update("/reviews", "POST", { body });
          }}>
            <label htmlFor="review-body">Write a review</label>
            <textarea id="review-body" value={body} maxLength={2000} rows={4} required
              onChange={(event) => setBody(event.target.value)} />
            <button className="primary-button" type="submit" disabled={busy || !body.trim()}>
              Submit review
            </button>
          </form>
        )}
        {!feedback.canReview && (
          <p role="status">
            {REVIEW_STATUS_MESSAGES[feedback.myReviewStatus] ?? ELIGIBILITY_MESSAGES[feedback.reviewReason]}
          </p>
        )}
      </>}
    </section>
  );
}
