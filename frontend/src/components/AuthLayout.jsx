import { ArrowLeft } from "@phosphor-icons/react";
import { motion as Motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import ThemeToggle from "./ThemeToggle";

const VISUALS = {
  login: {
    images: [
      "/pathwise-login-library.png",
      "/pathwise-login-window-study.png",
      "/pathwise-login-collaboration.png",
    ],
    alt: "University student reviewing a learning plan in a library",
    title: "Keep building on what you know.",
    copy: "Return to recommendations shaped around your degree programme, skills, and goals.",
  },
  register: {
    image: "/pathwise-learning-journey.png",
    alt: "A learning path connecting books, notes, and study milestones",
    title: "A useful course starts with your direction.",
    copy: "Share what you study and where you want to go. Pathwise will help connect the two.",
  },
};

export default function AuthLayout({
  title,
  intro,
  children,
  variant = "login",
  switchLabel,
  switchLinkLabel,
  switchTo,
}) {
  const reduceMotion = useReducedMotion();
  const visual = VISUALS[variant] || VISUALS.login;
  const images = visual.images || [visual.image];
  const [activeImage, setActiveImage] = useState(0);

  useEffect(() => {
    if (variant !== "login" || reduceMotion || images.length < 2) {
      return undefined;
    }

    const rotation = window.setInterval(() => {
      setActiveImage((current) => (current + 1) % images.length);
    }, 7000);

    return () => window.clearInterval(rotation);
  }, [images.length, reduceMotion, variant]);

  return (
    <main className="auth-shell min-h-[100dvh] overflow-hidden bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <div className={`auth-frame auth-frame--${variant} relative min-h-[100dvh] overflow-hidden`}>
        <Motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="auth-backdrop absolute inset-0"
          initial={reduceMotion ? false : { opacity: 0, scale: 1.025 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          {images.map((image, index) => {
            const isActive = index === activeImage;

            return (
              <img
                alt={variant === "login" ? "" : visual.alt}
                aria-hidden={variant === "login" ? "true" : undefined}
                className={`auth-backdrop__image absolute inset-0 h-full w-full object-cover ${
                  isActive ? "auth-backdrop__image--active" : ""
                }`}
                decoding="async"
                fetchPriority={index === 0 ? "high" : "low"}
                key={image}
                loading={index === 0 ? "eager" : "lazy"}
                src={image}
              />
            );
          })}
          <div className="auth-backdrop__wash absolute inset-0" />
        </Motion.div>

        <div className="auth-seam absolute hidden lg:block" aria-hidden="true" />

        <div className="relative grid min-h-[100dvh] lg:grid-cols-[minmax(24rem,1.05fr)_minmax(36rem,0.95fr)]">
          <section className="auth-content flex min-w-0 flex-col px-5 py-5 sm:px-10 sm:py-7 lg:order-2 lg:px-14 lg:py-8 xl:px-[7vw]">
            <header className="flex min-h-12 items-center justify-between gap-4">
              <Link
                aria-label="Pathwise home"
                className="auth-brand focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:focus-visible:outline-terracotta-400"
                to="/"
              >
                <span className="auth-brand__mark">
                  <img src="/pathwise-logo.svg" alt="" aria-hidden="true" />
                </span>
                <span>Pathwise</span>
              </Link>

              <div className="ml-auto flex items-center gap-2 sm:gap-3">
                {switchTo ? (
                  <p className="text-sm text-stone-600 dark:text-stone-300">
                    <span className="hidden sm:inline">{switchLabel} </span>
                    <Link
                      className="font-bold text-terracotta-800 underline-offset-4 hover:text-terracotta-950 hover:underline focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-terracotta-300 dark:hover:text-terracotta-200 dark:focus-visible:outline-terracotta-300"
                      to={switchTo}
                    >
                      {switchLinkLabel}
                    </Link>
                  </p>
                ) : (
                  <Link
                    className="inline-flex items-center gap-2 text-sm font-bold text-stone-600 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-stone-700 dark:text-stone-300 dark:hover:text-stone-50 dark:focus-visible:outline-stone-300"
                    to="/"
                  >
                    <ArrowLeft aria-hidden="true" size={16} weight="bold" />
                    Home
                  </Link>
                )}
                <ThemeToggle className="size-10 px-0" />
              </div>
            </header>

            <Motion.div
              animate={{ opacity: 1, y: 0 }}
              className="flex w-full max-w-[32rem] flex-1 flex-col justify-center py-10 sm:py-12 lg:ml-auto"
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              transition={{ delay: reduceMotion ? 0 : 0.1, duration: 0.58, ease: [0.16, 1, 0.3, 1] }}
            >
              <div>
                <p className="mb-4 font-mono text-xs font-bold uppercase tracking-[0.14em] text-terracotta-800 dark:text-terracotta-300">
                  {variant === "register" ? "Create your profile" : "Your learning space"}
                </p>
                <h1 className="max-w-lg font-display text-4xl font-bold leading-[1.02] tracking-[-0.045em] text-stone-950 sm:text-5xl dark:text-stone-50">
                  {title}
                </h1>
                <p className="mt-4 max-w-md text-base leading-7 text-stone-600 dark:text-stone-300">
                  {intro}
                </p>
              </div>
              <div className="mt-8">{children}</div>
            </Motion.div>
          </section>

          <aside className="relative hidden min-w-0 items-end justify-start p-10 lg:order-1 lg:flex xl:p-14">
            <Motion.div
              animate={{ opacity: 1, y: 0 }}
              className="max-w-md text-left"
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              transition={{ delay: reduceMotion ? 0 : 0.24, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="font-display text-3xl font-bold leading-[1.06] tracking-[-0.04em] text-stone-50 xl:text-4xl">
                {visual.title}
              </p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-stone-200">
                {visual.copy}
              </p>
            </Motion.div>
          </aside>
        </div>
      </div>
    </main>
  );
}
