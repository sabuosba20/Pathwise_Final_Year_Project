import { CheckCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router";

import client from "../api/client";
import AuthLayout from "../components/AuthLayout";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await client.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to process your request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout intro="Enter the email on your account and we'll send you a reset link." title="Reset your password">
      {submitted ? (
        <p className="inline-flex items-start gap-2 text-sm font-medium leading-6 text-terracotta-800 dark:text-terracotta-300" role="status">
          <CheckCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} weight="fill" />
          If an account exists for that email, a password reset link has been sent.
        </p>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="font-medium">Email</span>
            <input
              autoComplete="email"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 placeholder:text-stone-500 focus:border-terracotta-700 focus:outline-2 focus:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-terracotta-400 dark:focus:outline-terracotta-400"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          {error && <p className="text-sm font-medium text-red-700 dark:text-red-400" role="alert">{error}</p>}
          <button
            className="w-full rounded-xl bg-terracotta-800 px-5 py-3 font-semibold text-white hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 dark:bg-terracotta-500 dark:text-stone-950 dark:hover:bg-terracotta-400"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-stone-600 dark:text-stone-400">
        <Link className="font-semibold text-terracotta-800 underline-offset-4 hover:underline dark:text-terracotta-400" to="/login">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
