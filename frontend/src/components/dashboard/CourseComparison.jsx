import { ArrowSquareOut, CheckCircle, X } from "@phosphor-icons/react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";

import SafeExternalLink from "../SafeExternalLink";

const ROWS = [
  { label: "Provider", value: (course) => course.provider },
  { label: "Rating", value: (course) => course.rating == null ? "Not rated" : `${course.rating.toFixed(1)} / 5` },
  { label: "Subject", value: (course) => course.category },
  { label: "Difficulty", value: (course) => course.difficulty || "Unknown" },
  { label: "Type", value: (course) => course.resourceType || "Course" },
  { label: "Relevant fields", value: (course) => course.fieldTags?.slice(0, 3).join(", ") || "General studies" },
  { label: "Skills", value: (course) => course.skills?.slice(0, 4).join(", ") || "Not provided" },
];

export default function CourseComparison({ courses, onClose, onRemove }) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <section
        aria-labelledby="course-comparison-title"
        aria-modal="true"
        className="max-h-[92dvh] w-full max-w-6xl overflow-hidden rounded-t-2xl border border-stone-200 bg-stone-50 shadow-[0_28px_90px_rgb(0_0_0/0.28)] sm:rounded-2xl dark:border-stone-700 dark:bg-stone-950"
        role="dialog"
      >
        <header className="flex items-start justify-between gap-5 border-b border-stone-200 bg-white px-5 py-4 sm:px-6 dark:border-stone-800 dark:bg-stone-900">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-terracotta-800 dark:text-terracotta-300">Side-by-side decision</p>
            <h2 className="mt-1 font-display text-2xl font-bold tracking-tight" id="course-comparison-title">Compare courses</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">Compare up to three courses before choosing what to learn.</p>
          </div>
          <button
            aria-label="Close course comparison"
            autoFocus
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-stone-300 text-stone-600 transition-[transform,border-color,color] duration-150 hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" size={19} weight="bold" />
          </button>
        </header>

        <div className="max-h-[calc(92dvh-7.5rem)] overflow-auto p-4 sm:p-6">
          <div className="min-w-[46rem] overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            <div className="grid grid-cols-[10rem_repeat(var(--course-count),minmax(12rem,1fr))]" style={{ "--course-count": courses.length }}>
              <div className="border-b border-r border-stone-200 bg-stone-100 p-4 dark:border-stone-800 dark:bg-stone-800" />
              {courses.map((course) => (
                <div className="border-b border-r border-stone-200 p-4 last:border-r-0 dark:border-stone-800" key={course.id}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-base font-bold leading-6">{course.title}</h3>
                    <button
                      aria-label={`Remove ${course.title} from comparison`}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] dark:hover:bg-stone-800 dark:hover:text-stone-100"
                      onClick={() => onRemove(course)}
                      type="button"
                    >
                      <X aria-hidden="true" size={15} weight="bold" />
                    </button>
                  </div>
                  {course.isCompleted && (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-terracotta-800 dark:text-terracotta-300">
                      <CheckCircle aria-hidden="true" size={15} weight="fill" /> Completed
                    </p>
                  )}
                </div>
              ))}

              {ROWS.flatMap((row) => [
                <div className="border-b border-r border-stone-200 bg-stone-50 p-4 text-sm font-bold text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300" key={`${row.label}-label`}>{row.label}</div>,
                ...courses.map((course) => (
                  <div className="border-b border-r border-stone-200 p-4 text-sm leading-6 text-stone-700 last:border-r-0 dark:border-stone-800 dark:text-stone-300" key={`${row.label}-${course.id}`}>
                    {row.value(course)}
                  </div>
                )),
              ])}

              <div className="border-r border-stone-200 bg-stone-50 p-4 text-sm font-bold text-stone-700 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300">Actions</div>
              {courses.map((course) => (
                <div className="flex flex-col gap-2 border-r border-stone-200 p-4 last:border-r-0 dark:border-stone-800" key={`actions-${course.id}`}>
                  <Link className="inline-flex min-h-10 items-center justify-center rounded-xl border border-stone-300 px-3 text-xs font-bold text-stone-800 hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:border-stone-700 dark:text-stone-200 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300" to={`/resources/${course.id}`}>View details</Link>
                  <SafeExternalLink className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-terracotta-800 px-3 text-xs font-bold text-white hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300" href={course.url}>
                    Open course <ArrowSquareOut aria-hidden="true" size={14} weight="bold" />
                  </SafeExternalLink>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
