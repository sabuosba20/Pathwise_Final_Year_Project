import { ArrowLeft, Compass } from "@phosphor-icons/react";
import { Link } from "react-router";

import ThemeToggle from "../components/ThemeToggle";
import useAuth from "../context/useAuth";

export default function NotFound() {
  const { user } = useAuth();
  const destination = user
    ? (user.onboardingComplete ? "/dashboard" : "/onboarding")
    : "/";
  const destinationLabel = user
    ? (user.onboardingComplete ? "Back to your dashboard" : "Back to onboarding")
    : "Back to home";

  return (
    <main className="relative grid min-h-[100dvh] place-items-center bg-stone-50 px-6 text-center text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <ThemeToggle className="absolute top-5 right-5 size-10 px-0 sm:top-6 sm:right-6" />
      <div>
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300">
          <Compass aria-hidden="true" size={28} weight="bold" />
        </span>
        <p className="mt-6 font-display text-sm font-bold uppercase tracking-[0.12em] text-terracotta-800 dark:text-terracotta-300">
          404
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Page not found</h1>
        <p className="mx-auto mt-4 max-w-md leading-7 text-stone-600 dark:text-stone-400">
          The page you're looking for doesn't exist or may have moved.
        </p>
        <Link
          className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta-800 px-6 text-sm font-bold text-white hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300"
          to={destination}
        >
          <ArrowLeft aria-hidden="true" size={18} weight="bold" />
          {destinationLabel}
        </Link>
      </div>
    </main>
  );
}
