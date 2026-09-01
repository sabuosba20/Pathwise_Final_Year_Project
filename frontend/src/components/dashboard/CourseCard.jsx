import {
  ArrowSquareOut,
  BookmarkSimple,
  BookOpenText,
  CaretDown,
  CaretRight,
  CheckCircle,
  Plus,
  Sparkle,
  SpinnerGap,
  Star,
} from "@phosphor-icons/react";
import { useState } from "react";
import { Link } from "react-router";

import SafeExternalLink from "../SafeExternalLink";
import { Skeleton } from "../ui/Skeleton";

function MetadataBadge({ children, accent = false }) {
  return (
    <span className={`inline-flex min-h-7 items-center rounded-lg px-2.5 text-xs font-semibold ${accent ? "bg-terracotta-100 text-terracotta-900 dark:bg-terracotta-950 dark:text-terracotta-200" : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300"}`}>
      {children}
    </span>
  );
}

function formatReason(reason) {
  if (!reason) return "";
  if (reason.startsWith("Students with similar interests")) return reason;
  return "Matches your learning focus.";
}

function cleanDescription(description) {
  return description?.replaceAll("_x000D_", "").trim();
}

export default function CourseCard({
  bookmarkPending = false,
  compareDisabled = false,
  compareSelected = false,
  layout = "grid",
  onBookmarkToggle,
  onCompareToggle,
  onInteraction,
  reason,
  resource,
}) {
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const visibleSkills = resource.skills.slice(0, 3);
  const visibleFields = resource.fieldTags.slice(0, 2);
  const description = cleanDescription(resource.description);
  const completedDate = resource.completedAt
    ? new Date(resource.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "";
  const listLayout = layout === "list";
  const detailsId = `course-card-details-${resource.id}`;

  return (
    <article className={`group relative flex h-full flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_18px_50px_rgb(28_25_23/0.045)] transition-[border-color,box-shadow] duration-200 hover:border-terracotta-700 hover:shadow-[0_22px_55px_rgb(141_63_37/0.09)] dark:border-stone-800 dark:bg-stone-900 dark:shadow-none dark:hover:border-terracotta-500 sm:p-6 ${listLayout ? "min-h-0" : "min-h-[25rem]"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-display text-sm font-bold text-terracotta-800 dark:text-terracotta-300">{resource.provider}</p>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-stone-700 dark:text-stone-300" title={resource.rating == null ? "No provider rating available" : `Rated ${resource.rating} out of 5`}>
            <Star aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-400" size={17} weight={resource.rating == null ? "regular" : "fill"} />
            {resource.rating == null ? "Not rated" : resource.rating.toFixed(1)}
          </span>
        </div>
        <button
          aria-label={resource.isBookmarked ? `Remove ${resource.title} from saved courses` : `Save ${resource.title}`}
          aria-pressed={resource.isBookmarked}
          className={`relative z-10 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:outline-terracotta-400 ${resource.isBookmarked ? "border-terracotta-700 bg-terracotta-100 text-terracotta-950 dark:border-terracotta-400 dark:bg-terracotta-950 dark:text-terracotta-200" : "border-stone-300 text-stone-700 hover:border-terracotta-700 hover:text-terracotta-800 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"}`}
          disabled={bookmarkPending}
          onClick={() => onBookmarkToggle(resource)}
          type="button"
        >
          {bookmarkPending ? (
            <SpinnerGap aria-hidden="true" className="motion-safe:animate-spin" size={17} weight="bold" />
          ) : (
            <BookmarkSimple aria-hidden="true" size={17} weight={resource.isBookmarked ? "fill" : "bold"} />
          )}
          <span>{resource.isBookmarked ? "Saved" : "Save"}</span>
        </button>
      </div>

      <div className="mt-5">
        {reason && (
          <p className="mb-3 flex items-start gap-1.5 text-xs font-semibold text-terracotta-800 dark:text-terracotta-300">
            <Sparkle aria-hidden="true" className="mt-0.5 shrink-0" size={14} weight="fill" />
            {formatReason(reason)}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {resource.isCompleted && (
            <MetadataBadge accent>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle aria-hidden="true" size={14} weight="fill" />
                Completed{completedDate ? ` ${completedDate}` : ""}
              </span>
            </MetadataBadge>
          )}
          <MetadataBadge accent>{resource.category}</MetadataBadge>
          {resource.difficulty !== "Unknown" && <MetadataBadge>{resource.difficulty}</MetadataBadge>}
          {resource.resourceType !== "Course" && <MetadataBadge>{resource.resourceType}</MetadataBadge>}
        </div>
        <h3 className="mt-4 line-clamp-2 font-display text-xl font-bold leading-7 tracking-tight text-stone-950 dark:text-stone-100">
          <Link
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:focus-visible:outline-terracotta-400"
            to={`/resources/${resource.id}`}
          >
            {resource.title}
          </Link>
        </h3>
        <button
          aria-controls={detailsId}
          aria-expanded={detailsExpanded}
          className="relative z-10 mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-lg text-xs font-bold text-terracotta-800 transition-colors hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:text-terracotta-300 dark:hover:text-terracotta-200"
          onClick={() => setDetailsExpanded((expanded) => !expanded)}
          type="button"
        >
          {detailsExpanded ? "Hide description & details" : "Show description & details"}
          <CaretDown
            aria-hidden="true"
            className={`transition-transform duration-150 ${detailsExpanded ? "rotate-180" : ""}`}
            size={14}
            weight="bold"
          />
        </button>
      </div>

      {detailsExpanded && (
        <div id={detailsId}>
          <p className={`mt-3 text-sm leading-6 text-stone-600 dark:text-stone-400 ${listLayout ? "line-clamp-2" : "line-clamp-3"}`}>
            {description || "This provider did not include a course description in the source dataset."}
          </p>

          <div className={`mt-5 gap-3 border-t border-stone-200 pt-4 text-sm dark:border-stone-800 ${listLayout ? "grid sm:grid-cols-2" : "space-y-3"}`}>
            <div>
              <p className="font-semibold text-stone-800 dark:text-stone-200">Relevant fields</p>
              <p className="mt-1 line-clamp-1 text-stone-600 dark:text-stone-400">
                {visibleFields.length ? visibleFields.join(", ") : "General studies"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-stone-800 dark:text-stone-200">Skills covered</p>
              <p className="mt-1 line-clamp-1 text-stone-600 dark:text-stone-400">
                {visibleSkills.length ? visibleSkills.join(", ") : "Skills were not provided by this source"}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className={`mt-auto gap-3 pt-5 ${listLayout ? "sm:flex sm:items-center sm:justify-between" : ""}`}>
        <div className={`mb-2 flex items-center justify-between gap-3 ${listLayout ? "sm:mb-0" : ""}`}>
          <p className="inline-flex items-center gap-1 text-xs font-bold text-terracotta-800 dark:text-terracotta-300">
            View full details
            <CaretRight aria-hidden="true" size={13} weight="bold" />
          </p>
          <button
            aria-label={`${compareSelected ? "Remove" : "Add"} ${resource.title} ${compareSelected ? "from" : "to"} comparison`}
            aria-pressed={compareSelected}
            className={`relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-bold transition-[transform,border-color,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-45 ${compareSelected ? "border-terracotta-700 bg-terracotta-100 text-terracotta-950 dark:border-terracotta-400 dark:bg-terracotta-950 dark:text-terracotta-200" : "border-stone-300 text-stone-600 hover:border-terracotta-700 hover:text-terracotta-800 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"}`}
            disabled={compareDisabled && !compareSelected}
            onClick={() => onCompareToggle(resource)}
            type="button"
          >
            {compareSelected ? <CheckCircle aria-hidden="true" size={15} weight="fill" /> : <Plus aria-hidden="true" size={15} weight="bold" />}
            {compareSelected ? "Selected" : "Compare"}
          </button>
        </div>
        <SafeExternalLink
          className={`relative z-10 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta-800 px-4 py-2.5 text-sm font-bold text-stone-50 transition-colors hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300 dark:focus-visible:outline-terracotta-400 ${listLayout ? "sm:w-auto" : "w-full"}`}
          href={resource.url}
          onClick={() => onInteraction(resource.id, "outbound_click")}
        >
          <BookOpenText aria-hidden="true" size={18} weight="bold" />
          Open course
          <ArrowSquareOut aria-hidden="true" size={17} weight="bold" />
        </SafeExternalLink>
      </div>
    </article>
  );
}

export function CourseCardSkeleton() {
  return (
    <div aria-hidden="true" className="h-full min-h-[25rem] rounded-2xl border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex justify-between gap-4">
        <Skeleton className="h-4 w-24 rounded" />
        <Skeleton className="h-4 w-16 rounded" />
      </div>
      <div className="mt-6 flex gap-2">
        <Skeleton className="h-7 w-28 rounded-lg" />
        <Skeleton className="h-7 w-20 rounded-lg" />
      </div>
      <Skeleton className="mt-5 h-6 w-4/5 rounded" />
      <Skeleton className="mt-3 h-6 w-3/5 rounded" />
      <div className="mt-5 space-y-2">
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-11/12 rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
      </div>
      <div className="mt-8 border-t border-stone-200 pt-5 dark:border-stone-800">
        <Skeleton className="h-4 w-32 rounded" />
        <Skeleton className="mt-3 h-4 w-44 rounded" />
      </div>
      <Skeleton className="mt-8 h-11 rounded-xl" />
    </div>
  );
}
