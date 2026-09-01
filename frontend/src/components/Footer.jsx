import { Link } from "react-router";

export default function Footer({ maxWidth = "max-w-7xl" }) {
  return (
    <footer className="border-t border-stone-200 dark:border-stone-800">
      <div
        className={`mx-auto flex ${maxWidth} flex-col items-center gap-3 px-4 py-6 text-xs text-stone-500 sm:flex-row sm:justify-between sm:px-6 lg:px-8 dark:text-stone-500`}
      >
        <p className="flex items-center gap-2">
          <img src="/pathwise-logo.svg" alt="" aria-hidden="true" className="size-5 rounded-md" />
          {"©"} {new Date().getFullYear()} Pathwise
        </p>
        <nav aria-label="Legal" className="flex items-center gap-4">
          <Link className="hover:text-terracotta-800 hover:underline dark:hover:text-terracotta-300" to="/terms">
            Terms
          </Link>
          <Link className="hover:text-terracotta-800 hover:underline dark:hover:text-terracotta-300" to="/privacy">
            Privacy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
