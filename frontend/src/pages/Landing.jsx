import {
  ArrowRight,
  ChatCircleText,
  Compass,
  FunnelSimple,
  UsersThree,
} from "@phosphor-icons/react";
import { Link } from "react-router";

import CourseShowcase from "../components/CourseShowcase";
import InteractivePathScene from "../components/InteractivePathScene";
import PathwiseJourney from "../components/PathwiseJourney";
import ProgressiveFlow from "../components/ProgressiveFlow";
import RecommendationDeck from "../components/RecommendationDeck";
import Reveal from "../components/Reveal";
import ThemeToggle from "../components/ThemeToggle";

const flow = [
  { icon: Compass, arrow: ArrowRight, title: "Tell us what you study", copy: "Add your degree programme, skills, interests, and learning goals." },
  { icon: FunnelSimple, arrow: ArrowRight, title: "Match relevant content", copy: "Course topics and difficulty are compared with your profile." },
  { icon: UsersThree, arrow: ArrowRight, title: "Learn from similar students", copy: "Learners in related programmes with overlapping skills add context." },
  { icon: ChatCircleText, arrow: ArrowRight, title: "See the reason", copy: "Every result explains why it belongs on your path." },
];

export default function Landing() {
  return (
    <main className="landing-shell relative min-h-[100dvh] overflow-x-clip bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <header className="landing-nav sticky top-0 z-20 border-b border-stone-200/80 dark:border-stone-800/90">
        <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Primary navigation">
          <Link className="brand-link focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:focus-visible:outline-terracotta-400" to="/">
            <span className="brand-mark"><Compass size={20} weight="bold" aria-hidden="true" /></span>
            <span>Pathwise</span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-2">
            <a className="nav-link hidden md:inline-flex" href="#try-it">Try It</a>
            <a className="nav-link hidden sm:inline-flex" href="#how-it-works">How It Works</a>
            <Link className="nav-link hidden sm:inline-flex" to="/login">Log In</Link>
            <Link className="nav-cta" to="/register">
              Get Started <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
            <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-stone-300 sm:block dark:bg-stone-700" />
            <ThemeToggle className="size-10 px-0" variant="ghost" />
          </div>
        </nav>
      </header>
      <PathwiseJourney />

      <section className="hero-section journey-section mx-auto grid min-h-[calc(100dvh-72px)] max-w-7xl items-center gap-8 px-4 py-10 sm:px-6 md:grid-cols-[0.92fr_1.08fr] md:py-12 lg:gap-10 lg:px-8">
        <div className="relative z-10 max-w-2xl">
          <Reveal>
            <p className="hero-eyebrow">Courses that connect</p>
            <h1 className="mt-5 max-w-2xl font-display text-5xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-[4.5rem]">
              Find the course that <span className="hero-highlight">fits</span>.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-stone-600 dark:text-stone-300">
              Pathwise recommends relevant online courses from your degree programme, skills, goals, and what students with similar profiles found useful.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link className="primary-cta group" to="/register">
                Get Started
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" size={18} weight="bold" aria-hidden="true" />
              </Link>
              <Link className="secondary-cta" to="/login">Log In</Link>
            </div>
          </Reveal>
        </div>

        <Reveal className="relative w-full md:-mr-8" delay={0.12}>
          <InteractivePathScene />
        </Reveal>
      </section>

      <section className="course-showcase-section journey-section mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28" aria-labelledby="courses-heading">
        <Reveal>
          <CourseShowcase />
        </Reveal>
      </section>

      <section className="source-band journey-section border-y border-stone-200 dark:border-stone-800" aria-label="Course sources">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-stone-600 dark:text-stone-400">
            <span className="font-display font-bold text-stone-900 dark:text-stone-100">7,900+ courses</span> curated from five learning platforms.
          </p>
          <div className="provider-strip">
            <span>Coursera</span>
            <span>Udemy</span>
            <span>FutureLearn</span>
            <span>Udacity</span>
            <span>Simplilearn</span>
          </div>
        </div>
      </section>

      <section id="try-it" className="recommendation-lab journey-section" aria-labelledby="lab-heading">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <Reveal className="max-w-2xl">
            <h2 id="lab-heading" className="font-display text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">Change the goal. Watch the path adapt.</h2>
            <p className="mt-5 max-w-xl text-lg leading-8 text-stone-600 dark:text-stone-400">Choose what you want to learn and explore how the recommendation changes with it.</p>
          </Reveal>
          <Reveal className="mt-12" delay={0.1}>
            <RecommendationDeck />
          </Reveal>
        </div>
      </section>

      <section id="how-it-works" className="flow-section journey-section" aria-labelledby="flow-heading">
        <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <ProgressiveFlow items={flow}>
            <Reveal className="learning-flow__intro max-w-2xl">
              <h2 id="flow-heading" className="font-display text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">From profile to clear recommendation.</h2>
              <p className="mt-5 max-w-xl text-lg leading-8 text-stone-600 dark:text-stone-400">A focused process keeps each suggestion relevant, useful, and understandable.</p>
            </Reveal>
          </ProgressiveFlow>
        </div>
      </section>

      <section className="closing-section journey-section mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <Reveal className="final-cta">
          <div>
            <h2 className="max-w-2xl font-display text-4xl font-bold leading-tight tracking-[-0.04em] sm:text-5xl">Stop collecting courses. Start building a path.</h2>
            <p className="mt-4 max-w-xl text-lg leading-8 text-stone-600 dark:text-stone-300">Create your profile and discover what is worth learning next.</p>
          </div>
          <Link className="primary-cta group shrink-0" to="/register">
            Get Started
            <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" size={18} weight="bold" aria-hidden="true" />
          </Link>
        </Reveal>
      </section>

      <footer className="journey-section border-t border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-7 text-sm text-stone-600 dark:text-stone-400 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 font-display font-bold text-stone-900 dark:text-stone-100">
            <Compass size={18} weight="bold" aria-hidden="true" /> Pathwise
          </div>
          <p>Personalised course recommendations for university learners.</p>
          <nav aria-label="Legal" className="flex items-center gap-5">
            <Link className="hover:text-terracotta-800 hover:underline dark:hover:text-terracotta-300" to="/terms">Terms</Link>
            <Link className="hover:text-terracotta-800 hover:underline dark:hover:text-terracotta-300" to="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
