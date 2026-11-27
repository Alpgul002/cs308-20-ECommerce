import { useState } from "react";
import PaymentHistory from "./PaymentHistory.jsx";
import { ArrowLeft, LogOut, Mail, MapPin, UserRound } from "lucide-react";

export default function ProfilePage({ user, onBack, onLogout }) {
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(error.message || "Could not sign out. Please try again.");
      setLoggingOut(false);
    }
  }

  return (
    <main className="profile-page">
      <div className="page-container">
        <button type="button" className="login-back" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to store
        </button>

        <section className="profile-card" aria-labelledby="profile-title">
          <div className="profile-overview">
            <div className="profile-avatar" aria-hidden="true"><UserRound size={29} /></div>
            <p className="eyebrow">YOUR ORBIT ACCOUNT</p>
            <h1 id="profile-title">My profile</h1>
            <p>Your account details are securely loaded from your signed-in session.</p>
          </div>

          <div className="profile-content">
            <dl className="profile-field">
              <dt><UserRound size={15} /> Name</dt>
              <dd>{user.name}</dd>
            </dl>
            <dl className="profile-field">
              <dt><Mail size={15} /> Email address</dt>
              <dd>{user.email}</dd>
            </dl>
            <dl className="profile-field">
              <dt><MapPin size={15} /> Home address</dt>
              <dd>{user.homeAddress || "No home address on file."}</dd>
            </dl>

            <div className="profile-actions">
              {logoutError && <p className="profile-logout-error" role="alert">{logoutError}</p>}
              <button type="button" className="primary-button" onClick={handleLogout} disabled={loggingOut}>
                <LogOut size={17} />
                {loggingOut ? "Signing out..." : "Sign out"}
              </button>
            </div>
          </div>
        </section>
        <PaymentHistory />
      </div>
    </main>
  );
}
