import { CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import client from "../api/client";
import AuthLayout from "../components/AuthLayout";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [token] = useState(() => searchParams.get("token") || "");
  const navigate = useNavigate();
  const [form, setForm] = useState({ newPassword: "", confirmPassword: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await client.post("/auth/reset-password", { token, newPassword: form.newPassword });
      setSuccess(true);
      navigate("/reset-password", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to reset your password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout intro="This reset link is missing its token." title="Invalid reset link">
        <p className="inline-flex items-start gap-2 text-sm font-medium leading-6 text-red-700 dark:text-red-400" role="alert">
          <WarningCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} weight="bold" />
          Request a new link to reset your password.
        </p>
        <p className="mt-6 text-center text-sm text-stone-600 dark:text-stone-400">
          <Link className="font-semibold text-terracotta-800 underline-offset-4 hover:underline dark:text-terracotta-400" to="/forgot-password">
            Request a reset link
          </Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout intro="Choose a new password for your account." title="Set a new password">
      {success ? (
        <>
          <p className="inline-flex items-start gap-2 text-sm font-medium leading-6 text-terracotta-800 dark:text-terracotta-300" role="status">
            <CheckCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} weight="fill" />
            Your password has been reset.
          </p>
          <Link
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-terracotta-800 px-5 py-3 font-semibold text-white hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-500 dark:text-stone-950 dark:hover:bg-terracotta-400"
            to="/login"
          >
            Log in
          </Link>
        </>
      ) : (
        <form className="space-y-5" onSubmit={handleSubmit}>
          <label className="block">
            <span className="font-medium">New password</span>
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 focus:border-terracotta-700 focus:outline-2 focus:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-terracotta-400 dark:focus:outline-terracotta-400"
              minLength={12}
              onChange={(event) => setForm({ ...form, newPassword: event.target.value })}
              required
              type="password"
              value={form.newPassword}
            />
          </label>
          <label className="block">
            <span className="font-medium">Confirm new password</span>
            <input
              autoComplete="new-password"
              className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-950 focus:border-terracotta-700 focus:outline-2 focus:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-terracotta-400 dark:focus:outline-terracotta-400"
              minLength={12}
              onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })}
              required
              type="password"
              value={form.confirmPassword}
            />
          </label>
          {error && <p className="text-sm font-medium text-red-700 dark:text-red-400" role="alert">{error}</p>}
          <button
            className="w-full rounded-xl bg-terracotta-800 px-5 py-3 font-semibold text-white hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 dark:bg-terracotta-500 dark:text-stone-950 dark:hover:bg-terracotta-400"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Resetting..." : "Reset password"}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}
