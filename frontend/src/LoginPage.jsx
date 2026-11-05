import { useState } from "react";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  Mail,
  ShieldCheck
} from "lucide-react";

export default function LoginPage({ onBack, onSubmit }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = {};
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 8) {
      nextErrors.password = "Password must contain at least 8 characters.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length === 0) {
      onSubmit({ email: cleanEmail, password });
    }
  }

  return (
    <main className="login-page">
      <div className="page-container">
        <button type="button" className="login-back" onClick={onBack}>
          <ArrowLeft size={18} />
          Back to store
        </button>

        <section className="login-card">
          <div className="login-intro">
            <div className="login-brand">orbit<span>.</span></div>
            <p className="eyebrow">WELCOME BACK</p>
            <h1>Continue your Orbit journey.</h1>
            <p>
              Sign in before placing an order. Products already in your bag
              will remain there after login.
            </p>

            <div className="login-security">
              <ShieldCheck size={20} />
              <span>
                <strong>Secure sign-in</strong>
                Your password is never stored in the browser.
              </span>
            </div>
          </div>

          <div className="login-form-panel">
            <p className="eyebrow">CUSTOMER LOGIN</p>
            <h2>Sign in to your account</h2>

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <label>
                Email address
                <span className="login-input">
                  <Mail size={18} />
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                  />
                </span>
                {errors.email && (
                  <small className="login-error" role="alert">
                    {errors.email}
                  </small>
                )}
              </label>

              <label>
                Password
                <span className="login-input">
                  <LockKeyhole size={18} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    aria-invalid={Boolean(errors.password)}
                  />
                  <button
                    type="button"
                    className="password-toggle"
                    onClick={() => setShowPassword((current) => !current)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword
                      ? <EyeOff size={18} />
                      : <Eye size={18} />}
                  </button>
                </span>
                {errors.password && (
                  <small className="login-error" role="alert">
                    {errors.password}
                  </small>
                )}
              </label>

              <button type="submit" className="primary-button wide">
                <LogIn size={18} />
                Sign in
              </button>
            </form>

            <p className="login-note">
                Your shopping bag remains available while you sign in.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}