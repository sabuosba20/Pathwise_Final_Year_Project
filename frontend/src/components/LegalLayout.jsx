import { Link } from "react-router";

import ThemeToggle from "./ThemeToggle";

export default function LegalLayout({ title, updated, children }) {
  return (
    <main className="min-h-[100dvh] bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link className="inline-flex text-lg font-bold tracking-tight text-terracotta-800 dark:text-terracotta-400" to="/">
            Pathwise
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-stone-500 dark:text-stone-500">Last updated {updated}</p>
        <div className="mt-8 space-y-6 leading-7 text-stone-700 dark:text-stone-300">{children}</div>
      </article>
    </main>
  );
}
