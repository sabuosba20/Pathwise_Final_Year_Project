import {
  ArrowRight,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  LockKey,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import client from "../api/client";
import AuthField from "../components/AuthField";
import AuthLayout from "../components/AuthLayout";
import useAuth from "../context/useAuth";

const DEMO_ACCOUNTS = [
  { label: "CS Student", email: "cs-demo@pathwise.dev", password: "demo1234" },
  { label: "Business Student", email: "business-demo@pathwise.dev", password: "demo1234" },
  { label: "My Account", email: "sohaib@email.com", password: "sohaibsohaib" },
];

export default function Login() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { completeAuth, user } = useAuth();
  const navigate = useNavigate();

  async function performLogin(credentials) {
    setError("");
    try {
      const { data } = await client.post("/auth/login", credentials);
      completeAuth(data.user);
      const destination = data.user.onboardingComplete ? "/dashboard" : "/onboarding";
      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to log in. Please try again.");
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    await performLogin(form);
    setSubmitting(false);
  }

  async function handleDemoLogin(account) {
    const credentials = { email: account.email, password: account.password };
    setForm(credentials);
    setSubmitting(true);
    await performLogin(credentials);
    setSubmitting(false);
  }

  return (
    <AuthLayout
      intro="Your recommendations and saved learning progress are ready when you are."
      switchLabel="New to Pathwise?"
      switchLinkLabel="Create an account"
      switchTo="/register"
      title="Welcome back."
      variant="login"
    >
      {user && (
        <div className="auth-session-notice" role="status">
          <div>
            <strong>Currently signed in as {user.name}</strong>
            <p>Log in below to switch accounts, or continue your current session.</p>
          </div>
          <Link to={user.onboardingComplete ? "/dashboard" : "/onboarding"}>
            Continue
            <ArrowRight aria-hidden="true" size={15} weight="bold" />
          </Link>
        </div>
      )}
      <form className="space-y-5" onSubmit={handleSubmit}>
        <AuthField
          autoComplete="email"
          icon={EnvelopeSimple}
          id="login-email"
          label="Email"
          name="email"
          onChange={(event) => setForm({ ...form, email: event.target.value })}
          placeholder="you@university.edu"
          required
          type="email"
          value={form.email}
        />
        <AuthField
          action={(
            <Link
              className="text-sm font-semibold text-terracotta-800 underline-offset-4 hover:text-terracotta-950 hover:underline dark:text-terracotta-300 dark:hover:text-terracotta-200"
              to="/forgot-password"
            >
              Forgot password?
            </Link>
          )}
          autoComplete="current-password"
          icon={LockKey}
          id="login-password"
          label="Password"
          name="password"
          onChange={(event) => setForm({ ...form, password: event.target.value })}
          placeholder="Enter your password"
          required
          trailing={(
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="auth-field__trailing"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? <EyeSlash aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
            </button>
          )}
          type={showPassword ? "text" : "password"}
          value={form.password}
        />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit group" disabled={submitting} type="submit">
          <span>{submitting ? "Opening your space..." : "Log in"}</span>
          {!submitting && (
            <ArrowRight
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
              size={18}
              weight="bold"
            />
          )}
        </button>
      </form>

      <details className="auth-demo">
        <summary>
          <span>Try a demo account</span>
          <span className="auth-demo__hint">Instant access</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              className="auth-demo__account"
              disabled={submitting}
              key={account.email}
              onClick={() => handleDemoLogin(account)}
              type="button"
            >
              {account.label}
            </button>
          ))}
        </div>
      </details>
    </AuthLayout>
  );
}
