import {
  ArrowsLeftRight,
  BookmarkSimple,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link } from "react-router";

import client from "../../api/client";
import { LoadingRegion } from "../ui/Skeleton";
import CataloguePagination from "./CataloguePagination";
import CourseCard, { CourseCardSkeleton } from "./CourseCard";
import CourseComparison from "./CourseComparison";

const EMPTY_PAGINATION = {
  page: 1,
  perPage: 12,
  total: 0,
  pages: 0,
  hasNext: false,
  hasPrevious: false,
};

export default function SavedCoursesTab({ onSavedCountChange }) {
  const [resources, setResources] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [bookmarkPendingIds, setBookmarkPendingIds] = useState(new Set());
  const [bookmarkError, setBookmarkError] = useState("");
  const [comparisonCourses, setComparisonCourses] = useState([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    client
      .get("/resources", {
        params: { page, per_page: 12, bookmarked: true, sort: "rating" },
        signal: controller.signal,
      })
      .then(({ data }) => {
        setResources(data.resources);
        setPagination(data.pagination);
        onSavedCountChange(data.pagination.total);
      })
      .catch((requestError) => {
        if (requestError.code !== "ERR_CANCELED") {
          setError("Your saved courses could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, requestVersion]);

  function handlePageChange(nextPage) {
    setPage(nextPage);
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion ? "auto" : "smooth",
    });
  }

  async function handleBookmarkToggle(resource) {
    setBookmarkError("");
    setBookmarkPendingIds((current) => new Set(current).add(resource.id));
    setResources((current) =>
      current.filter((item) => item.id !== resource.id),
    );

    try {
      await client.delete(`/bookmarks/${resource.id}`);
      if (resources.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        setRequestVersion((version) => version + 1);
      }
    } catch (requestError) {
      setBookmarkError(
        requestError.response?.data?.message ||
          "Your saved courses could not be updated. Please try again.",
      );
      setRequestVersion((version) => version + 1);
    } finally {
      setBookmarkPendingIds((current) => {
        const next = new Set(current);
        next.delete(resource.id);
        return next;
      });
    }
  }

  function recordInteraction(resourceId, type) {
    client.post("/interactions", { resourceId, type }).catch(() => {});
  }

  function handleCompareToggle(resource) {
    setComparisonCourses((current) => {
      if (current.some((course) => course.id === resource.id)) {
        return current.filter((course) => course.id !== resource.id);
      }
      if (current.length >= 3) return current;
      return [...current, resource];
    });
  }

  function handleComparisonRemove(resource) {
    if (comparisonCourses.length <= 2) setComparisonOpen(false);
    handleCompareToggle(resource);
  }

  return (
    <>
      <section aria-busy={loading} aria-labelledby="saved-results-title">
        <div className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between dark:border-stone-800">
          <div>
            <h2
              className="font-display text-xl font-bold tracking-tight"
              id="saved-results-title"
            >
              Saved courses
            </h2>
            <p
              aria-live="polite"
              className="mt-1 text-sm text-stone-600 dark:text-stone-400"
            >
              {loading
                ? "Loading your saved courses"
                : `${pagination.total.toLocaleString()} course${pagination.total === 1 ? "" : "s"} saved`}
            </p>
          </div>
        </div>

        {bookmarkError && (
          <div
            className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
            role="alert"
          >
            {bookmarkError}
          </div>
        )}

        {error ? (
          <div
            className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-6 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
            role="alert"
          >
            <WarningCircle aria-hidden="true" size={28} weight="bold" />
            <h3 className="mt-4 font-display text-lg font-bold">
              Unable to load saved courses
            </h3>
            <p className="mt-2 text-sm leading-6">{error}</p>
            <button
              className="mt-5 min-h-11 rounded-xl bg-red-900 px-4 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-red-800 active:translate-y-px dark:bg-red-200 dark:text-red-950"
              onClick={() => setRequestVersion((version) => version + 1)}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : loading ? (
          <LoadingRegion className="mt-6" label="Loading saved courses">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <CourseCardSkeleton key={index} />
              ))}
            </div>
          </LoadingRegion>
        ) : resources.length ? (
          <>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {resources.map((resource) => (
                <CourseCard
                  bookmarkPending={bookmarkPendingIds.has(resource.id)}
                  compareDisabled={comparisonCourses.length >= 3}
                  compareSelected={comparisonCourses.some(
                    (course) => course.id === resource.id,
                  )}
                  key={resource.id}
                  onBookmarkToggle={handleBookmarkToggle}
                  onCompareToggle={handleCompareToggle}
                  onInteraction={recordInteraction}
                  resource={resource}
                />
              ))}
            </div>
            <CataloguePagination
              disabled={loading}
              onPageChange={handlePageChange}
              pagination={pagination}
            />
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-stone-300 px-6 py-14 text-center dark:border-stone-700">
            <BookmarkSimple
              aria-hidden="true"
              className="mx-auto text-terracotta-700 dark:text-terracotta-400"
              size={36}
              weight="bold"
            />
            <h3 className="mt-4 font-display text-xl font-bold">
              No saved courses yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600 dark:text-stone-400">
              Save courses from the catalogue to find them here whenever you
              need them.
            </p>
            <Link
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-terracotta-800 px-4 text-sm font-bold text-stone-50 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950 dark:focus-visible:outline-terracotta-400"
              to="/catalogue"
            >
              Browse the catalogue
            </Link>
          </div>
        )}
      </section>

      {comparisonCourses.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-xl items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white/95 px-4 py-3 shadow-[0_20px_60px_rgb(28_25_23/0.2)] backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold">
              <ArrowsLeftRight
                aria-hidden="true"
                className="text-terracotta-700 dark:text-terracotta-300"
                size={18}
                weight="bold"
              />{" "}
              {comparisonCourses.length} of 3 selected
            </p>
            <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">
              {comparisonCourses.map((course) => course.title).join(" / ")}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              className="min-h-10 rounded-xl px-3 text-xs font-bold text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] dark:text-stone-300 dark:hover:bg-stone-800"
              onClick={() => setComparisonCourses([])}
              type="button"
            >
              Clear
            </button>
            <button
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-terracotta-800 px-4 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-terracotta-400 dark:text-stone-950"
              disabled={comparisonCourses.length < 2}
              onClick={() => setComparisonOpen(true)}
              type="button"
            >
              Compare
            </button>
          </div>
        </div>
      )}

      {comparisonOpen && (
        <CourseComparison
          courses={comparisonCourses}
          onClose={() => setComparisonOpen(false)}
          onRemove={handleComparisonRemove}
        />
      )}
    </>
  );
}
