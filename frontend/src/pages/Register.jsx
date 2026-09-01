import {
  ArrowRight,
  Check,
  EnvelopeSimple,
  Eye,
  EyeSlash,
  LockKey,
  User,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";

import client from "../api/client";
import AuthField from "../components/AuthField";
import AuthLayout from "../components/AuthLayout";
import useAuth from "../context/useAuth";

export default function Register() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { completeAuth } = useAuth();
  const navigate = useNavigate();

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const { data } = await client.post("/auth/register", form);
      completeAuth(data.user);
      navigate("/onboarding", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create your account. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      intro="Start with the essentials. Your learning preferences come next."
      switchLabel="Already have an account?"
      switchLinkLabel="Log in"
      switchTo="/login"
      title="Make your learning path personal."
      variant="register"
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <AuthField
          autoComplete="name"
          icon={User}
          id="register-name"
          label="Name"
          name="name"
          onChange={updateField}
          placeholder="How should we address you?"
          required
          type="text"
          value={form.name}
        />
        <AuthField
          autoComplete="email"
          icon={EnvelopeSimple}
          id="register-email"
          label="Email"
          name="email"
          onChange={updateField}
          placeholder="you@university.edu"
          required
          type="email"
          value={form.email}
        />
        <AuthField
          action={(
            <button
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="auth-field__action"
              onClick={() => setShowPassword((visible) => !visible)}
              type="button"
            >
              {showPassword ? <EyeSlash aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
            </button>
          )}
          autoComplete="new-password"
          helper={(
            <span className={`inline-flex items-center gap-1.5 ${form.password.length >= 12 ? "auth-field__valid" : ""}`}>
              <Check aria-hidden="true" size={14} weight="bold" />
              Use 12 or more characters
            </span>
          )}
          icon={LockKey}
          id="register-password"
          label="Password"
          minLength={12}
          name="password"
          onChange={updateField}
          placeholder="Create a secure password"
          required
          type={showPassword ? "text" : "password"}
          value={form.password}
        />
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit group" disabled={submitting} type="submit">
          <span>{submitting ? "Creating your path..." : "Create account"}</span>
          {!submitting && (
            <ArrowRight
              aria-hidden="true"
              className="transition-transform duration-300 group-hover:translate-x-1"
              size={18}
              weight="bold"
            />
          )}
        </button>
        <p className="text-center text-xs leading-5 text-stone-600 dark:text-stone-400">
          By creating an account, you agree to Pathwise&apos;s{" "}
          <Link className="font-semibold underline-offset-4 hover:underline" to="/terms">Terms of Use</Link> and{" "}
          <Link className="font-semibold underline-offset-4 hover:underline" to="/privacy">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
