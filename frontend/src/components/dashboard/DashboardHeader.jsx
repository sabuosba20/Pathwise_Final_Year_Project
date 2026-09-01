import {
  Books,
  CaretDown,
  ClockCounterClockwise,
  GearSix,
  House,
  SignOut,
  Target,
  UserCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";

import Avatar from "../Avatar";
import ThemeToggle from "../ThemeToggle";

export default function DashboardHeader({ userName, onLogout }) {
  const location = useLocation();
  const menuRef = useRef(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const onDashboard = location.pathname === "/dashboard";
  const onCatalogue = location.pathname === "/catalogue" || location.pathname.startsWith("/resources/");
  const onGoals = location.pathname === "/goals";
  const onActivity = location.pathname === "/activity";
  const onProfile = location.pathname === "/profile";
  const onSettings = location.pathname === "/settings";

  useEffect(() => {
    if (!accountMenuOpen) return undefined;

    function closeOnOutsidePress(event) {
      if (!menuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  function handleLogout() {
    setAccountMenuOpen(false);
    onLogout();
  }

  return (
    <header className="relative z-30 border-b border-stone-200 bg-stone-50/95 dark:border-stone-800 dark:bg-stone-950/95">
      <div className="flex min-h-18 items-center justify-between gap-3 px-12 sm:px-20 lg:px-28">
        <div className="flex items-center gap-2 sm:gap-4">
          <Link
            aria-label="Pathwise home"
            className="inline-flex items-center gap-3 font-display text-lg font-bold tracking-tight text-stone-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-stone-100 dark:focus-visible:outline-terracotta-400"
            to="/dashboard"
          >
            <span className="inline-flex size-9 -rotate-6 items-center justify-center overflow-hidden rounded-xl">
              <img src="/pathwise-logo.svg" alt="" aria-hidden="true" className="size-full" />
            </span>
            <span className="hidden sm:inline">Pathwise</span>
          </Link>

          <nav aria-label="Primary" className="flex items-center gap-0.5">
            <Link
              aria-label="Home"
              aria-current={onDashboard ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 sm:px-3 sm:text-sm dark:focus-visible:outline-terracotta-400 ${
                onDashboard
                  ? "bg-terracotta-800 text-white dark:bg-terracotta-400 dark:text-stone-950"
                  : "text-stone-600 hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-900"
              }`}
              to="/dashboard"
            >
              <House aria-hidden="true" size={18} weight={onDashboard ? "fill" : "bold"} />
              <span className="hidden min-[430px]:inline">Home</span>
            </Link>
            <Link
              aria-label="Catalogue"
              aria-current={onCatalogue ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 sm:px-3 sm:text-sm dark:focus-visible:outline-terracotta-400 ${
                onCatalogue
                  ? "bg-terracotta-800 text-white dark:bg-terracotta-400 dark:text-stone-950"
                  : "text-stone-600 hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-900"
              }`}
              to="/catalogue"
            >
              <Books aria-hidden="true" size={18} weight={onCatalogue ? "fill" : "bold"} />
              <span className="hidden min-[430px]:inline">Catalogue</span>
            </Link>
            <Link
              aria-label="Goals"
              aria-current={onGoals ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 sm:px-3 sm:text-sm dark:focus-visible:outline-terracotta-400 ${
                onGoals
                  ? "bg-terracotta-800 text-white dark:bg-terracotta-400 dark:text-stone-950"
                  : "text-stone-600 hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-900"
              }`}
              to="/goals"
            >
              <Target aria-hidden="true" size={18} weight={onGoals ? "fill" : "bold"} />
              <span className="hidden min-[430px]:inline">Goals</span>
            </Link>
            <Link
              aria-label="Activity"
              aria-current={onActivity ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 sm:px-3 sm:text-sm dark:focus-visible:outline-terracotta-400 ${
                onActivity
                  ? "bg-terracotta-800 text-white dark:bg-terracotta-400 dark:text-stone-950"
                  : "text-stone-600 hover:bg-stone-200/70 dark:text-stone-400 dark:hover:bg-stone-900"
              }`}
              to="/activity"
            >
              <ClockCounterClockwise aria-hidden="true" size={18} weight={onActivity ? "fill" : "bold"} />
              <span className="hidden min-[430px]:inline">Activity</span>
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <div className="relative" ref={menuRef}>
            <button
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              aria-label="Open account menu"
              className={`inline-flex min-h-11 items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 sm:pr-3 dark:focus-visible:outline-terracotta-400 ${
                onProfile || onSettings || accountMenuOpen
                  ? "bg-terracotta-100 dark:bg-terracotta-950"
                  : "hover:bg-stone-200/70 dark:hover:bg-stone-900"
              }`}
              onClick={() => setAccountMenuOpen((open) => !open)}
              type="button"
            >
              <Avatar name={userName} size="sm" />
              <span className="hidden max-w-36 truncate text-sm font-semibold text-stone-900 dark:text-stone-100 sm:inline">
                {userName}
              </span>
              <CaretDown
                aria-hidden="true"
                className={`text-stone-500 transition-transform dark:text-stone-400 ${accountMenuOpen ? "rotate-180" : ""}`}
                size={14}
                weight="bold"
              />
            </button>

            {accountMenuOpen && (
            <div
              aria-label="Account"
              className="absolute right-0 top-[calc(100%+0.6rem)] w-64 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-[0_18px_50px_rgb(28_25_23/0.14)] dark:border-stone-700 dark:bg-stone-900 dark:shadow-[0_18px_50px_rgb(0_0_0/0.35)]"
              role="menu"
            >
              <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
                <p className="truncate text-sm font-bold text-stone-950 dark:text-stone-100">{userName}</p>
                <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">Your Pathwise account</p>
              </div>
              <div className="p-1.5">
                <Link
                  className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:outline-terracotta-400"
                  onClick={() => setAccountMenuOpen(false)}
                  role="menuitem"
                  to="/profile"
                >
                  <UserCircle aria-hidden="true" size={19} weight="bold" />
                  View profile
                </Link>
                <Link
                  className="flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:outline-terracotta-400"
                  onClick={() => setAccountMenuOpen(false)}
                  role="menuitem"
                  to="/settings"
                >
                  <GearSix aria-hidden="true" size={19} weight="bold" />
                  Account settings
                </Link>
                <div className="my-1 border-t border-stone-200 dark:border-stone-800" />
                <button
                  className="flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-semibold text-stone-700 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:outline-terracotta-400"
                  onClick={handleLogout}
                  role="menuitem"
                  type="button"
                >
                  <SignOut aria-hidden="true" size={19} weight="bold" />
                  Log out
                </button>
              </div>
            </div>
            )}
          </div>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
