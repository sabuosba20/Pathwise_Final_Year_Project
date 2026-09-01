import {
  ArrowSquareOut,
  ArrowsLeftRight,
  BookmarkSimple,
  BookOpenText,
  CaretDown,
  CaretRight,
  DotsThree,
  EyeSlash,
  Sparkle,
  SpinnerGap,
  Star,
  ThumbsUp,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";

import SafeExternalLink from "../SafeExternalLink";
import { Skeleton } from "../ui/Skeleton";

function cleanDescription(description) {
  return description?.replaceAll("_x000D_", "").trim();
}

function MatchTag({ children }) {
  return (
    <span className="inline-flex min-h-7 items-center rounded-lg border border-stone-200 bg-stone-50 px-2.5 text-xs font-semibold text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300">
      {children}
    </span>
  );
}

function ExplanationList({ reasons }) {
  return (
    <ul className="mt-3 space-y-3">
      {reasons.map((item, index) => (
        <li
          className="border-l-2 border-terracotta-300 pl-3 dark:border-terracotta-800"
          key={`${item.type || "reason"}-${index}`}
        >
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.1em] text-terracotta-700 dark:text-terracotta-300">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-semibold leading-6 text-stone-800 dark:text-stone-200">
            {item.text}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function RecommendationCard({
  bookmarkPending = false,
  compareDisabled = false,
  compareSelected = false,
  feedbackPending = false,
  featured = false,
  onBookmarkToggle,
  onCompareToggle,
  onFeedback,
  onInteraction,
  personalized = true,
  rank,
  reason,
  reasons = [],
  resource,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [explanationsExpanded, setExplanationsExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const menuRef = useRef(null);
  const description = cleanDescription(resource.description);
  const matchingFields = resource.fieldTags?.slice(0, featured ? 3 : 2) || [];
  const matchingSkills = resource.skills?.slice(0, featured ? 4 : 3) || [];
  const moreLikeThisSelected = resource.feedbackType === "more_like_this";
  const explanationReasons = reasons.length
    ? reasons
    : [
        {
          label: personalized ? "Learning signals" : "Course quality",
          text:
            reason
            || (personalized
              ? "Selected from your available learning signals."
              : "Shown from the highest-rated courses while personalization is incomplete."),
          type: "default",
        },
      ];
  const collapsedExplanationCount = featured ? 3 : 2;
  const visibleExplanationReasons = explanationsExpanded
    ? explanationReasons
    : explanationReasons.slice(0, collapsedExplanationCount);
  const hasMoreExplanations = explanationReasons.length > collapsedExplanationCount;
  const explanationsId = `recommendation-explanations-${resource.id}`;
  const detailsId = `recommendation-details-${resource.id}`;

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border bg-white transition-[border-color,box-shadow] duration-200 ease-out dark:bg-stone-900 dark:shadow-none ${
        featured
          ? "border-terracotta-400 shadow-[0_24px_65px_rgb(141_63_37/0.11)] dark:border-terracotta-700"
          : "border-stone-200 shadow-[0_16px_45px_rgb(28_25_23/0.045)] hover:border-terracotta-400 dark:border-stone-800 dark:hover:border-terracotta-700"
      }`}
    >
      <div className={`grid h-full ${featured && detailsExpanded ? "lg:grid-cols-[minmax(0,1.22fr)_minmax(19rem,0.78fr)]" : ""}`}>
        <div className={`flex min-w-0 flex-col ${featured ? "p-6 sm:p-8" : "p-5 sm:p-6"}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-terracotta-800 dark:text-terracotta-300">
                {personalized
                  ? featured
                    ? "Top recommendation"
                    : `Recommendation ${rank}`
                  : featured
                    ? "Popular starting point"
                    : `Popular course ${rank}`}
              </p>
              <p className="mt-2 font-display text-sm font-bold text-stone-600 dark:text-stone-300">
                {resource.provider}
              </p>
            </div>

            <div className="relative z-10 flex shrink-0 items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 dark:text-stone-300"
                title={
                  resource.rating == null
                    ? "No provider rating available"
                    : `Rated ${resource.rating} out of 5`
                }
              >
                <Star
                  aria-hidden="true"
                  className="text-terracotta-700 dark:text-terracotta-400"
                  size={17}
                  weight={resource.rating == null ? "regular" : "fill"}
                />
                {resource.rating == null ? "Not rated" : resource.rating.toFixed(1)}
              </span>
              <button
                aria-label={
                  resource.isBookmarked
                    ? `Remove ${resource.title} from saved courses`
                    : `Save ${resource.title}`
                }
                aria-pressed={resource.isBookmarked}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-[transform,border-color,background-color,color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] disabled:cursor-wait disabled:opacity-70 dark:focus-visible:outline-terracotta-400 ${
                  resource.isBookmarked
                    ? "border-terracotta-700 bg-terracotta-100 text-terracotta-950 dark:border-terracotta-400 dark:bg-terracotta-950 dark:text-terracotta-200"
                    : "border-stone-300 text-stone-700 hover:border-terracotta-700 hover:text-terracotta-800 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
                }`}
                disabled={bookmarkPending}
                onClick={() => onBookmarkToggle(resource)}
                type="button"
              >
                {bookmarkPending ? (
                  <SpinnerGap
                    aria-hidden="true"
                    className="motion-safe:animate-spin"
                    size={17}
                    weight="bold"
                  />
                ) : (
                  <BookmarkSimple
                    aria-hidden="true"
                    size={17}
                    weight={resource.isBookmarked ? "fill" : "bold"}
                  />
                )}
                <span>{resource.isBookmarked ? "Saved" : "Save"}</span>
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  aria-controls={`recommendation-menu-${resource.id}`}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label={`More actions for ${resource.title}`}
                  className="inline-flex size-10 items-center justify-center rounded-xl border border-stone-300 text-stone-600 transition-[transform,border-color,color] duration-150 hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] disabled:cursor-wait disabled:opacity-60 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300 dark:focus-visible:outline-terracotta-400"
                  disabled={feedbackPending}
                  onClick={() => setMenuOpen((current) => !current)}
                  type="button"
                >
                  {feedbackPending ? (
                    <SpinnerGap
                      aria-hidden="true"
                      className="motion-safe:animate-spin"
                      size={18}
                      weight="bold"
                    />
                  ) : (
                    <DotsThree aria-hidden="true" size={22} weight="bold" />
                  )}
                </button>

                {menuOpen && (
                  <div
                    className="absolute right-0 top-12 z-30 w-56 rounded-xl border border-stone-200 bg-white p-1.5 shadow-[0_16px_45px_rgb(28_25_23/0.16)] dark:border-stone-700 dark:bg-stone-900"
                    id={`recommendation-menu-${resource.id}`}
                    role="menu"
                  >
                    <button
                      className="flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:outline-terracotta-400"
                      onClick={() => {
                        setMenuOpen(false);
                        onFeedback(resource, "not_interested");
                      }}
                      role="menuitem"
                      type="button"
                    >
                      <EyeSlash
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-stone-500 dark:text-stone-400"
                        size={18}
                        weight="bold"
                      />
                      <span>
                        <span className="block font-bold">Not interested</span>
                        <span className="mt-0.5 block text-xs leading-4 text-stone-500 dark:text-stone-400">
                          Hide this and adjust your ranking
                        </span>
                      </span>
                    </button>
                    {onCompareToggle && (
                      <button
                        aria-pressed={compareSelected}
                        className="flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-stone-700 transition-colors hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:text-stone-200 dark:hover:bg-stone-800 dark:focus-visible:outline-terracotta-400"
                        disabled={compareDisabled && !compareSelected}
                        onClick={() => {
                          setMenuOpen(false);
                          onCompareToggle(resource);
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <ArrowsLeftRight
                          aria-hidden="true"
                          className="mt-0.5 shrink-0 text-stone-500 dark:text-stone-400"
                          size={18}
                          weight="bold"
                        />
                        <span>
                          <span className="block font-bold">{compareSelected ? "Remove from comparison" : "Add to comparison"}</span>
                          <span className="mt-0.5 block text-xs leading-4 text-stone-500 dark:text-stone-400">
                            Compare course details side by side
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={featured ? "mt-7" : "mt-6"}>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex min-h-7 items-center rounded-lg bg-terracotta-100 px-2.5 text-xs font-semibold text-terracotta-900 dark:bg-terracotta-950 dark:text-terracotta-200">
                {resource.category}
              </span>
              {resource.difficulty !== "Unknown" && <MatchTag>{resource.difficulty}</MatchTag>}
              {resource.resourceType !== "Course" && <MatchTag>{resource.resourceType}</MatchTag>}
            </div>

            <h2
              className={`mt-4 font-display font-bold leading-tight tracking-tight text-stone-950 dark:text-stone-100 ${
                featured ? "max-w-3xl text-2xl sm:text-3xl" : "line-clamp-2 text-xl"
              }`}
            >
              <Link
                className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:focus-visible:outline-terracotta-400"
                to={`/resources/${resource.id}`}
              >
                {resource.title}
              </Link>
            </h2>

            <button
              aria-controls={detailsId}
              aria-expanded={detailsExpanded}
              className="relative z-10 mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg text-xs font-bold text-terracotta-800 transition-colors hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:text-terracotta-300 dark:hover:text-terracotta-200"
              onClick={() => setDetailsExpanded((expanded) => !expanded)}
              type="button"
            >
              <Sparkle aria-hidden="true" size={14} weight="fill" />
              {detailsExpanded ? "Hide description & why this fits" : "Show description & why this fits"}
              <CaretDown
                aria-hidden="true"
                className={`transition-transform duration-150 ${detailsExpanded ? "rotate-180" : ""}`}
                size={14}
                weight="bold"
              />
            </button>

            {detailsExpanded && (
              <p
                className={`mt-3 text-sm leading-6 text-stone-600 dark:text-stone-400 ${
                  featured ? "max-w-3xl sm:text-base sm:leading-7" : ""
                }`}
                id={detailsId}
              >
                {description || "This provider did not include a course description in the source dataset."}
              </p>
            )}
          </div>

          {!featured && detailsExpanded && (
            <div className="mt-5 rounded-xl bg-terracotta-50 p-4 dark:bg-terracotta-950/45">
              <div className="flex items-center gap-2 text-terracotta-950 dark:text-terracotta-100">
                <Sparkle
                  aria-hidden="true"
                  className="shrink-0 text-terracotta-700 dark:text-terracotta-300"
                  size={16}
                  weight="fill"
                />
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-terracotta-700 dark:text-terracotta-300">
                  {personalized ? "Why this fits" : "Why this is shown"}
                </p>
                <span className="ml-auto rounded-md bg-white/70 px-2 py-1 text-[0.68rem] font-bold text-terracotta-800 dark:bg-stone-950/35 dark:text-terracotta-200">
                  {explanationReasons.length} signal{explanationReasons.length === 1 ? "" : "s"}
                </span>
              </div>
              <div id={explanationsId}>
                <ExplanationList reasons={visibleExplanationReasons} />
              </div>
              {hasMoreExplanations && (
                <button
                  aria-controls={explanationsId}
                  aria-expanded={explanationsExpanded}
                  className="relative z-10 mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-terracotta-800 transition-colors hover:bg-white/70 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:text-terracotta-200 dark:hover:bg-stone-950/35 dark:hover:text-terracotta-100"
                  onClick={() => setExplanationsExpanded((expanded) => !expanded)}
                  type="button"
                >
                  {explanationsExpanded ? "Show fewer signals" : `View all ${explanationReasons.length} signals`}
                  <CaretDown
                    aria-hidden="true"
                    className={`transition-transform duration-150 ${explanationsExpanded ? "rotate-180" : ""}`}
                    size={15}
                    weight="bold"
                  />
                </button>
              )}
            </div>
          )}

          <div className="relative z-10 mt-5 flex flex-col gap-3 border-t border-stone-200 pt-4 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
            <div className={featured ? "" : "sr-only sm:not-sr-only"}>
              <p className="text-sm font-bold text-stone-800 dark:text-stone-200">
                Improve your ranking
              </p>
            </div>
            <button
              aria-label={
                moreLikeThisSelected
                  ? `Remove more like this feedback for ${resource.title}`
                  : `Recommend more courses like ${resource.title}`
              }
              aria-pressed={moreLikeThisSelected}
              className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border px-3.5 text-xs font-bold transition-[transform,border-color,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] disabled:cursor-wait disabled:opacity-65 dark:focus-visible:outline-terracotta-400 ${featured ? "" : "w-full sm:w-auto"} ${
                moreLikeThisSelected
                  ? "border-terracotta-700 bg-terracotta-100 text-terracotta-950 dark:border-terracotta-400 dark:bg-terracotta-950 dark:text-terracotta-100"
                  : "border-stone-300 text-stone-700 hover:border-terracotta-700 hover:text-terracotta-800 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
              }`}
              disabled={feedbackPending}
              onClick={() => onFeedback(
                resource,
                moreLikeThisSelected ? null : "more_like_this",
              )}
              type="button"
            >
              {feedbackPending ? (
                <SpinnerGap
                  aria-hidden="true"
                  className="motion-safe:animate-spin"
                  size={17}
                  weight="bold"
                />
              ) : (
                <ThumbsUp
                  aria-hidden="true"
                  size={17}
                  weight={moreLikeThisSelected ? "fill" : "bold"}
                />
              )}
              More like this
            </button>
          </div>

          <div className="relative z-10 mt-auto flex flex-col gap-3 pt-6 sm:flex-row">
            <Link
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-800 transition-[transform,border-color,color] duration-150 ease-out hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:border-stone-700 dark:text-stone-100 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
              to={`/resources/${resource.id}`}
            >
              Course details
              <CaretRight aria-hidden="true" size={16} weight="bold" />
            </Link>
            <SafeExternalLink
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-terracotta-800 px-4 text-sm font-bold text-white transition-[transform,background-color] duration-150 ease-out hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300"
              href={resource.url}
              onClick={() => onInteraction(resource.id, "outbound_click")}
            >
              <BookOpenText aria-hidden="true" size={18} weight="bold" />
              Open course
              <ArrowSquareOut aria-hidden="true" size={16} weight="bold" />
            </SafeExternalLink>
          </div>
        </div>

        {featured && detailsExpanded && (
          <aside className="border-t border-terracotta-200 bg-terracotta-50 p-6 dark:border-terracotta-900 dark:bg-terracotta-950/45 sm:p-8 lg:border-l lg:border-t-0">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-terracotta-950 dark:text-terracotta-100">
                <Sparkle aria-hidden="true" size={18} weight="fill" />
                <p>{personalized ? "Why Pathwise chose this" : "Why this is shown"}</p>
                <span className="ml-auto rounded-md bg-white/70 px-2 py-1 text-[0.68rem] font-bold text-terracotta-800 dark:bg-stone-950/35 dark:text-terracotta-200">
                  {explanationReasons.length} signal{explanationReasons.length === 1 ? "" : "s"}
                </span>
              </div>
              <div id={explanationsId}>
                <ExplanationList reasons={visibleExplanationReasons} />
              </div>
              {hasMoreExplanations && (
                <button
                  aria-controls={explanationsId}
                  aria-expanded={explanationsExpanded}
                  className="relative z-10 mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-terracotta-800 transition-colors hover:bg-white/70 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:text-terracotta-200 dark:hover:bg-stone-950/35 dark:hover:text-terracotta-100"
                  onClick={() => setExplanationsExpanded((expanded) => !expanded)}
                  type="button"
                >
                  {explanationsExpanded ? "Show fewer signals" : `View all ${explanationReasons.length} signals`}
                  <CaretDown
                    aria-hidden="true"
                    className={`transition-transform duration-150 ${explanationsExpanded ? "rotate-180" : ""}`}
                    size={15}
                    weight="bold"
                  />
                </button>
              )}
            </div>

            <div className="mt-7">
              <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500 dark:text-stone-400">
                {personalized ? "Matching course topics" : "Course topics"}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[...matchingFields, ...matchingSkills].slice(0, 6).map((match, index) => (
                  <MatchTag key={`${match}-${index}`}>{match}</MatchTag>
                ))}
                {!matchingFields.length && !matchingSkills.length && (
                  <span className="text-sm text-stone-600 dark:text-stone-400">
                    General learning match
                  </span>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </article>
  );
}

export function RecommendationCardSkeleton({ featured = false }) {
  return (
    <div
      aria-hidden="true"
      className={`overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 ${
        featured ? "lg:grid lg:grid-cols-[1.22fr_0.78fr]" : ""
      }`}
    >
      <div className="p-6 sm:p-8">
        <div className="flex justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-32 rounded" />
            <Skeleton className="mt-3 h-4 w-24 rounded" />
          </div>
          <Skeleton className="h-10 w-24 rounded-xl" />
        </div>
        <Skeleton className="mt-8 h-7 w-3/4 rounded" />
        <Skeleton className="mt-3 h-7 w-1/2 rounded" />
        <div className="mt-6 space-y-2">
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-11/12 rounded" />
          <Skeleton className="h-3 w-2/3 rounded" />
        </div>
        <Skeleton className="mt-8 h-11 rounded-xl" />
      </div>
      {featured && (
        <div className="min-h-56 border-t border-terracotta-200 bg-terracotta-50 p-6 dark:border-terracotta-900 dark:bg-terracotta-950/40 sm:p-8 lg:border-l lg:border-t-0">
          <Skeleton className="h-4 w-40 rounded" />
          <Skeleton className="mt-6 h-3 w-full rounded" />
          <Skeleton className="mt-3 h-3 w-5/6 rounded" />
          <Skeleton className="mt-8 h-7 w-28 rounded-lg" />
        </div>
      )}
    </div>
  );
}
