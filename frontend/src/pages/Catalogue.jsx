import {
  ArrowsLeftRight,
  ArrowRight,
  Books,
  CheckCircle,
  ListBullets,
  Sparkle,
  SquaresFour,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import client from "../api/client";
import CatalogueFilters from "../components/dashboard/CatalogueFilters";
import CataloguePagination from "../components/dashboard/CataloguePagination";
import CourseComparison from "../components/dashboard/CourseComparison";
import CourseCard, { CourseCardSkeleton } from "../components/dashboard/CourseCard";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Footer from "../components/Footer";
import RecommendationCard, {
  RecommendationCardSkeleton,
} from "../components/dashboard/RecommendationCard";
import { LoadingRegion, Skeleton } from "../components/ui/Skeleton";
import useAuth from "../context/useAuth";
import useDebouncedValue from "../hooks/useDebouncedValue";

const EMPTY_FILTERS = {
  provider: "",
  category: "",
  difficulty: "",
  resourceType: "",
};

const EMPTY_OPTIONS = {
  providers: [],
  categories: [],
  difficulties: [],
  resourceTypes: [],
};

const EMPTY_PAGINATION = {
  page: 1,
  perPage: 12,
  total: 0,
  pages: 0,
  hasNext: false,
  hasPrevious: false,
};

const FILTER_LABELS = {
  provider: "Provider",
  category: "Subject",
  difficulty: "Difficulty",
  resourceType: "Type",
};

function mapRecommendationResponse(data) {
  return data.recommendations.map((item, index) => ({
    ...item.resource,
    breakdown: item.breakdown,
    feedbackType: item.feedbackType,
    rank: index + 1,
    reason: item.reason,
    reasons: item.reasons || [],
    score: item.score,
  }));
}

function formatSourceList(sources) {
  if (sources.length < 2) return sources[0] || "";
  if (sources.length === 2) return sources.join(" and ");
  return `${sources.slice(0, -1).join(", ")}, and ${sources.at(-1)}`;
}

function getCatalogueView(searchParams) {
  const requestedView = searchParams.get("view");
  return ["all", "completed", "recommended"].includes(requestedView) ? requestedView : "all";
}

function CatalogueLayoutToggle({ layout, onChange }) {
  return (
    <div
      aria-label="Course layout"
      className="flex w-fit shrink-0 rounded-xl border border-stone-300 bg-white p-1 dark:border-stone-700 dark:bg-stone-900"
      role="group"
    >
      <button
        aria-label="Grid view"
        aria-pressed={layout === "grid"}
        className={`inline-flex size-9 items-center justify-center rounded-lg transition-[transform,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] ${layout === "grid" ? "bg-terracotta-100 text-terracotta-900 dark:bg-terracotta-950 dark:text-terracotta-200" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"}`}
        onClick={() => onChange("grid")}
        title="Show courses in a grid"
        type="button"
      >
        <SquaresFour aria-hidden="true" size={18} weight="bold" />
      </button>
      <button
        aria-label="List view"
        aria-pressed={layout === "list"}
        className={`inline-flex size-9 items-center justify-center rounded-lg transition-[transform,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] ${layout === "list" ? "bg-terracotta-100 text-terracotta-900 dark:bg-terracotta-950 dark:text-terracotta-200" : "text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"}`}
        onClick={() => onChange("list")}
        title="Show courses in a list"
        type="button"
      >
        <ListBullets aria-hidden="true" size={18} weight="bold" />
      </button>
    </div>
  );
}

export default function Catalogue() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [resources, setResources] = useState([]);
  const [filterOptions, setFilterOptions] = useState(EMPTY_OPTIONS);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState(() => (
    getCatalogueView(searchParams) === "completed" ? "completed" : "rating"
  ));
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [viewMode, setViewMode] = useState(() => getCatalogueView(searchParams));
  const [bookmarkPendingIds, setBookmarkPendingIds] = useState(new Set());
  const [bookmarkError, setBookmarkError] = useState("");
  const [feedbackPendingIds, setFeedbackPendingIds] = useState(new Set());
  const [feedbackError, setFeedbackError] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [personalized, setPersonalized] = useState(true);
  const [catalogueLayout, setCatalogueLayout] = useState("grid");
  const [comparisonCourses, setComparisonCourses] = useState([]);
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [viewCounts, setViewCounts] = useState({ completed: null });
  const recommendationRefreshRef = useRef(0);
  const debouncedQuery = useDebouncedValue(query);

  const fetchResources = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      if (viewMode === "recommended") {
        const { data } = await client.get("/recommendations", {
          params: { limit: 12 },
          signal,
        });
        setResources(mapRecommendationResponse(data));
        setPagination(EMPTY_PAGINATION);
        setConfidence(data.confidence);
        setPersonalized(data.personalized);
      } else {
        const { data } = await client.get("/resources", {
          params: {
            page,
            per_page: 12,
            q: debouncedQuery || undefined,
            provider: filters.provider || undefined,
            category: filters.category || undefined,
            difficulty: filters.difficulty || undefined,
            resource_type: filters.resourceType || undefined,
            sort,
            completed: viewMode === "completed" ? true : undefined,
          },
          signal,
        });
        setResources(data.resources);
        setPagination(data.pagination);
        setFilterOptions(data.filterOptions);
      }
    } catch (requestError) {
      if (requestError.code !== "ERR_CANCELED") {
        setError(requestError.response?.data?.message || "The catalogue could not be loaded. Please try again.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [debouncedQuery, filters, page, sort, viewMode]);

  useEffect(() => {
    const controller = new AbortController();
    fetchResources(controller.signal);
    return () => controller.abort();
  }, [fetchResources, requestVersion]);

  useEffect(() => {
    const controller = new AbortController();
    client.get("/resources", { params: { completed: true, per_page: 1 }, signal: controller.signal })
      .then((completedResponse) => {
        setViewCounts({ completed: completedResponse.data.pagination.total });
      })
      .catch((requestError) => {
        if (requestError.code !== "ERR_CANCELED") {
          setViewCounts((current) => current);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const nextView = getCatalogueView(searchParams);
    setViewMode(nextView);
    setPage(1);
    setSort(nextView === "completed" ? "completed" : "rating");
    setBookmarkError("");
  }, [searchParams]);

  useEffect(() => {
    if (!feedbackNotice) return undefined;
    const timeoutId = window.setTimeout(() => setFeedbackNotice(null), 15000);
    return () => window.clearTimeout(timeoutId);
  }, [feedbackNotice]);

  const hasActiveFilters = useMemo(
    () => Boolean(query || Object.values(filters).some(Boolean)),
    [filters, query],
  );

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function handleQueryChange(value) {
    setQuery(value);
    setPage(1);
  }

  function handleFilterChange(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function clearFilters() {
    setQuery("");
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }

  function clearFilter(key) {
    if (key === "query") {
      handleQueryChange("");
      return;
    }
    handleFilterChange(key, "");
  }

  function handleViewModeChange(nextMode) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextMode === "all") {
      nextParams.delete("view");
    } else {
      nextParams.set("view", nextMode);
    }
    setSearchParams(nextParams, { replace: true });
  }

  async function handleBookmarkToggle(resource) {
    const nextBookmarked = !resource.isBookmarked;
    setBookmarkError("");
    setBookmarkPendingIds((current) => new Set(current).add(resource.id));
    setResources((current) => current.map((item) => (
      item.id === resource.id
        ? { ...item, isBookmarked: nextBookmarked }
        : item
    )));

    try {
      if (nextBookmarked) {
        await client.post(`/bookmarks/${resource.id}`);
      } else {
        await client.delete(`/bookmarks/${resource.id}`);
      }
    } catch (requestError) {
      setBookmarkError(
        requestError.response?.data?.message
          || "Your saved courses could not be updated. Please try again.",
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
    client.post("/interactions", { resourceId, type }).catch(() => {
      // Course navigation and reading should not be blocked by analytics failure.
    });
  }

  async function refreshRecommendationRanking() {
    // Concurrent feedback clicks on different cards each trigger their own
    // refresh; only the response from the most recently issued request should
    // ever be applied, so an older one resolving late can't clobber a newer
    // ranking with stale data.
    const requestId = ++recommendationRefreshRef.current;
    const { data } = await client.get("/recommendations", {
      params: { limit: 12 },
    });
    if (requestId !== recommendationRefreshRef.current) return;
    setResources(mapRecommendationResponse(data));
    setConfidence(data.confidence);
    setPersonalized(data.personalized);
  }

  async function handleRecommendationFeedback(resource, feedbackType) {
    setFeedbackError("");
    setFeedbackPendingIds((current) => new Set(current).add(resource.id));

    if (feedbackType === "not_interested") {
      setResources((current) => current.filter((item) => item.id !== resource.id));
    } else {
      setResources((current) => current.map((item) => (
        item.id === resource.id
          ? { ...item, feedbackType }
          : item
      )));
    }

    try {
      if (feedbackType) {
        await client.post("/recommendations/feedback", {
          resourceId: resource.id,
          type: feedbackType,
          recommendationRank: resource.rank,
          recommendationReason: resource.reason || undefined,
        });
      } else {
        await client.delete(`/recommendations/feedback/${resource.id}`);
      }

      await refreshRecommendationRanking();
      setFeedbackNotice({
        canUndo: Boolean(feedbackType),
        feedbackType,
        message:
          feedbackType === "not_interested"
            ? `"${resource.title}" was hidden and your ranking was updated.`
            : feedbackType === "more_like_this"
              ? `Pathwise will prioritise courses similar to "${resource.title}".`
              : `Your feedback for "${resource.title}" was removed.`,
        resourceId: resource.id,
      });
    } catch (requestError) {
      setFeedbackError(
        requestError.response?.data?.message
          || "Your recommendation feedback could not be updated. Please try again.",
      );
      setRequestVersion((version) => version + 1);
    } finally {
      setFeedbackPendingIds((current) => {
        const next = new Set(current);
        next.delete(resource.id);
        return next;
      });
    }
  }

  async function undoRecommendationFeedback() {
    if (!feedbackNotice?.resourceId) return;

    const { resourceId } = feedbackNotice;
    setFeedbackError("");
    setFeedbackPendingIds((current) => new Set(current).add(resourceId));
    try {
      await client.delete(`/recommendations/feedback/${resourceId}`);
      await refreshRecommendationRanking();
      setFeedbackNotice({
        canUndo: false,
        message: "Feedback undone. Your previous ranking has been restored.",
        resourceId: null,
      });
    } catch (requestError) {
      setFeedbackError(
        requestError.response?.data?.message
          || "The feedback could not be undone. Please try again.",
      );
    } finally {
      setFeedbackPendingIds((current) => {
        const next = new Set(current);
        next.delete(resourceId);
        return next;
      });
    }
  }

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

  const activeFilterChips = [
    query ? { key: "query", label: `Search: ${query}` } : null,
    ...Object.entries(filters).map(([key, value]) => (
      value ? { key, label: `${FILTER_LABELS[key]}: ${value}` } : null
    )),
  ].filter(Boolean);

  const profileSignalWeight = Math.round((confidence?.weightContent || 0) * 100);
  const activitySignalWeight = Math.round((confidence?.weightCollaborative || 0) * 100);
  const diversityScore = Math.round(
    (confidence?.diversity?.score || 0) * 100,
  );
  const hasLearningProfileSource = Boolean(
    confidence?.contentSources?.learningProfile,
  );
  const savedCourseSourceCount =
    confidence?.contentSources?.savedCourseCount || 0;
  const positiveFeedbackSourceCount =
    confidence?.contentSources?.positiveFeedbackCount || 0;
  const contentSignalSources = [
    hasLearningProfileSource ? "Learning profile" : null,
    savedCourseSourceCount
      ? `${savedCourseSourceCount} saved course${savedCourseSourceCount === 1 ? "" : "s"}`
      : null,
    positiveFeedbackSourceCount
      ? `${positiveFeedbackSourceCount} more-like choice${positiveFeedbackSourceCount === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);
  const contentSignalDescription =
    contentSignalSources.length
      ? contentSignalSources.join(", ")
      : "No personal content yet";
  const recommendationSources = [
    hasLearningProfileSource ? "your learning profile" : null,
    savedCourseSourceCount ? "your saved courses" : null,
    positiveFeedbackSourceCount ? "courses you asked to see more of" : null,
  ].filter(Boolean);
  const recommendationDescription =
    personalized && recommendationSources.length
      ? `A focused ranking shaped by ${formatSourceList(recommendationSources)}.`
      : "Pathwise ranks relevant courses using the learning signals available from your account.";

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <DashboardHeader onLogout={handleLogout} userName={user?.name || "Student"} />

      <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-10 lg:px-6 lg:py-10">
          <header
            className={
              viewMode === "recommended"
                ? "grid gap-7 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end"
                : "max-w-3xl"
            }
          >
            <div>
              {viewMode === "recommended" && (
                <p className="flex items-center gap-2 text-sm font-bold text-terracotta-800 dark:text-terracotta-300">
                  <Sparkle aria-hidden="true" size={18} weight="fill" />
                  Your Pathwise ranking
                </p>
              )}
              <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                {viewMode === "recommended"
                  ? "Recommendations built around you"
                  : viewMode === "completed"
                    ? "Your completed courses"
                    : "Explore the course catalogue"}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-stone-600 dark:text-stone-400">
                {viewMode === "recommended"
                  ? recommendationDescription
                  : viewMode === "completed"
                    ? "Review the courses you have finished and return to their materials whenever you need a refresher."
                    : "Search the validated catalogue by subject, provider, and difficulty. Your personalised ranking will use this same course collection."}
              </p>
            </div>

            {viewMode === "recommended" && (
              <div className="lg:text-right">
                <Link
                  className="inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:text-terracotta-300 dark:hover:text-terracotta-200"
                  to="/settings"
                >
                  Review learning profile
                  <ArrowRight aria-hidden="true" size={16} weight="bold" />
                </Link>
              </div>
            )}
          </header>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-10 lg:px-6 lg:py-12">
        <nav
          aria-label="Catalogue views"
          className="mt-7 grid w-full grid-cols-3 rounded-xl border border-stone-300 bg-white p-1 sm:inline-grid sm:w-auto dark:border-stone-700 dark:bg-stone-900"
        >
          {[
            { key: "all", label: "All courses" },
            { key: "completed", label: "Completed courses", count: viewCounts.completed },
            { key: "recommended", label: "Recommended for you" },
          ].map(({ key, label, count }) => (
            <button
              aria-current={viewMode === key ? "page" : undefined}
              className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-center text-xs font-bold leading-4 transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 sm:gap-2 sm:px-3.5 sm:text-sm dark:focus-visible:outline-terracotta-400 ${viewMode === key ? "bg-terracotta-800 text-white dark:bg-terracotta-400 dark:text-stone-950" : "text-stone-600 hover:text-terracotta-800 dark:text-stone-400 dark:hover:text-terracotta-300"}`}
              key={key}
              onClick={() => handleViewModeChange(key)}
              type="button"
            >
              {key === "recommended" && (
                <Sparkle aria-hidden="true" size={18} weight={viewMode === key ? "fill" : "bold"} />
              )}
              {key === "completed" && (
                <CheckCircle aria-hidden="true" size={18} weight={viewMode === key ? "fill" : "bold"} />
              )}
              {key === "all" && (
                <Books aria-hidden="true" size={18} weight={viewMode === key ? "fill" : "bold"} />
              )}
              {label}
              {count != null && (
                <span className={`rounded-md px-1.5 py-0.5 text-[0.68rem] ${viewMode === key ? "bg-white/20 text-current dark:bg-stone-950/20" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {viewMode === "recommended" && (
          <section
            aria-label="Recommendation model signals"
            className="mt-7 overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900"
          >
            {loading || !confidence ? (
              <LoadingRegion label="Loading recommendation signals">
                <div className="grid gap-px bg-stone-200 sm:grid-cols-2 lg:grid-cols-4 dark:bg-stone-800">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div className="h-24 bg-white p-5 dark:bg-stone-900" key={index}>
                      <Skeleton className="h-3 w-24 rounded" />
                      <Skeleton className="mt-3 h-7 w-16 rounded" />
                    </div>
                  ))}
                </div>
              </LoadingRegion>
            ) : personalized ? (
              <dl className="grid gap-px bg-stone-200 sm:grid-cols-2 lg:grid-cols-4 dark:bg-stone-800">
                <div className="bg-white p-5 dark:bg-stone-900 sm:p-6">
                  <dt className="text-sm font-semibold text-stone-500 dark:text-stone-400">
                    Content signal
                  </dt>
                  <dd className="mt-2 font-display text-2xl font-bold text-stone-950 dark:text-stone-100">
                    {profileSignalWeight}%
                  </dd>
                  <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                    {contentSignalDescription}
                  </p>
                </div>
                <div className="bg-white p-5 dark:bg-stone-900 sm:p-6">
                  <dt className="text-sm font-semibold text-stone-500 dark:text-stone-400">
                    Activity signal
                  </dt>
                  <dd className="mt-2 font-display text-2xl font-bold text-stone-950 dark:text-stone-100">
                    {activitySignalWeight}%
                  </dd>
                  <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                    Views, saves and direct feedback
                  </p>
                </div>
                <div className="bg-white p-5 dark:bg-stone-900 sm:p-6">
                  <dt className="text-sm font-semibold text-stone-500 dark:text-stone-400">
                    Learning signals
                  </dt>
                  <dd className="mt-2 font-display text-2xl font-bold text-stone-950 dark:text-stone-100">
                    {confidence.interactionCount}
                  </dd>
                  <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                    Distinct course interactions
                  </p>
                </div>
                <div className="bg-white p-5 dark:bg-stone-900 sm:p-6">
                  <dt className="text-sm font-semibold text-stone-500 dark:text-stone-400">
                    Result diversity
                  </dt>
                  <dd className="mt-2 font-display text-2xl font-bold text-stone-950 dark:text-stone-100">
                    {diversityScore}%
                  </dd>
                  <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                    {confidence.diversity?.uniqueCategories || 0} subjects,{" "}
                    {confidence.diversity?.uniqueProviders || 0} providers
                  </p>
                </div>
              </dl>
            ) : (
              <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <h2 className="font-display text-lg font-bold">Personalisation is not active yet</h2>
                  <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">
                    Add your degree and skills to replace the current top-rated course list with personal matches.
                  </p>
                </div>
                <Link
                  className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:bg-terracotta-400 dark:text-stone-950"
                  to="/settings"
                >
                  Complete learning profile
                </Link>
              </div>
            )}
          </section>
        )}

        {bookmarkError && (
          <div className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
            {bookmarkError}
          </div>
        )}

        {feedbackError && (
          <div className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
            {feedbackError}
          </div>
        )}

        <div className={`mt-8 grid items-start gap-7 ${viewMode === "recommended" ? "" : "lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-9"}`}>
          {viewMode !== "recommended" && (
            <CatalogueFilters
              filters={filters}
              hasActiveFilters={hasActiveFilters}
              onClear={clearFilters}
              onFilterChange={handleFilterChange}
              onQueryChange={handleQueryChange}
              options={filterOptions}
              query={query}
            />
          )}

          <section aria-busy={loading} aria-labelledby="catalogue-results-title" className="min-w-0">
            <div
              className={`flex flex-col gap-4 pb-5 sm:flex-row sm:items-end sm:justify-between ${
                viewMode === "recommended"
                  ? ""
                  : "border-b border-stone-200 dark:border-stone-800"
              }`}
            >
              <div>
                <h2
                  className={`font-display font-bold tracking-tight ${
                    viewMode === "recommended" ? "text-2xl sm:text-3xl" : "text-xl"
                  }`}
                  id="catalogue-results-title"
                >
                  {viewMode === "completed"
                    ? "Completed courses"
                    : viewMode === "recommended"
                      ? "Your ranked matches"
                      : "Available courses"}
                </h2>
                <p aria-live="polite" className="mt-1 text-sm text-stone-600 dark:text-stone-400">
                  {loading
                    ? viewMode === "recommended"
                      ? "Building your recommendation ranking"
                      : "Loading catalogue results"
                    : viewMode === "recommended"
                      ? `${resources.length} course${resources.length === 1 ? "" : "s"} ordered by relevance to you`
                      : `${pagination.total.toLocaleString()} course${pagination.total === 1 ? "" : "s"} found`}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
                {viewMode !== "recommended" && (
                  <>
                    {pagination.pages > 1 && (
                      <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">Page {pagination.page} of {pagination.pages}</p>
                    )}
                    <div className="flex items-end gap-2">
                      <label className="min-w-0 flex-1 sm:w-48 sm:flex-none" htmlFor="catalogue-sort">
                        <span className="text-sm font-semibold text-stone-800 dark:text-stone-200">Sort results</span>
                        <select
                          className="mt-2 min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-950 focus:border-terracotta-700 focus:outline-2 focus:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:focus:border-terracotta-400 dark:focus:outline-terracotta-400"
                          id="catalogue-sort"
                          onChange={(event) => {
                            if (event.target.value === "best_match") {
                              handleViewModeChange("recommended");
                              return;
                            }
                            setSort(event.target.value);
                            setPage(1);
                          }}
                          value={sort}
                        >
                          <option value="best_match">Best match (personalised)</option>
                          {viewMode === "completed" && <option value="completed">Recently completed</option>}
                          <option value="rating">Highest rated</option>
                          <option value="title">Course title</option>
                          <option value="provider">Provider</option>
                        </select>
                      </label>
                      <CatalogueLayoutToggle layout={catalogueLayout} onChange={setCatalogueLayout} />
                    </div>
                  </>
                )}
                {viewMode === "recommended" && (
                  <CatalogueLayoutToggle layout={catalogueLayout} onChange={setCatalogueLayout} />
                )}
              </div>
            </div>

            {viewMode !== "recommended" && activeFilterChips.length > 0 && (
              <div aria-label="Active catalogue filters" className="mt-4 flex flex-wrap items-center gap-2">
                {activeFilterChips.map((chip) => (
                  <button
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-terracotta-200 bg-terracotta-50 px-2.5 text-xs font-bold text-terracotta-900 transition-[transform,border-color,background-color] duration-150 hover:border-terracotta-400 hover:bg-terracotta-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] dark:border-terracotta-900 dark:bg-terracotta-950/50 dark:text-terracotta-200 dark:hover:border-terracotta-700"
                    key={chip.key}
                    onClick={() => clearFilter(chip.key)}
                    type="button"
                  >
                    {chip.label}
                    <X aria-hidden="true" size={14} weight="bold" />
                  </button>
                ))}
                <button className="min-h-9 px-2 text-xs font-bold text-stone-600 underline-offset-4 hover:text-terracotta-800 hover:underline focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-stone-400 dark:hover:text-terracotta-300" onClick={clearFilters} type="button">Clear all</button>
              </div>
            )}

            {error ? (
              <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-6 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
                <WarningCircle aria-hidden="true" size={28} weight="bold" />
                <h3 className="mt-4 font-display text-lg font-bold">Unable to load courses</h3>
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
              <LoadingRegion
                className={viewMode === "recommended" ? "mt-3" : "mt-6"}
                label={viewMode === "recommended" ? "Building your recommendation ranking" : "Loading catalogue results"}
              >
                {viewMode === "recommended" ? (
                  <div className={`grid gap-5 ${catalogueLayout === "grid" ? "md:grid-cols-2" : "grid-cols-1"}`}>
                    <div className={catalogueLayout === "grid" ? "md:col-span-2" : ""}>
                      <RecommendationCardSkeleton featured />
                    </div>
                    {Array.from({ length: 4 }, (_, index) => (
                      <RecommendationCardSkeleton key={index} />
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 6 }, (_, index) => <CourseCardSkeleton key={index} />)}
                  </div>
                )}
              </LoadingRegion>
            ) : resources.length ? (
              <>
                <div className={`grid gap-5 ${viewMode === "recommended" ? catalogueLayout === "grid" ? "mt-3 md:grid-cols-2" : "mt-3 grid-cols-1" : catalogueLayout === "grid" ? "mt-6 md:grid-cols-2 xl:grid-cols-3" : "mt-6 grid-cols-1"}`}>
                  {resources.map((resource, index) => (
                    <div
                      className={viewMode === "recommended" && catalogueLayout === "grid" && index === 0 ? "md:col-span-2" : ""}
                      key={resource.id}
                    >
                      {viewMode === "recommended" ? (
                        <RecommendationCard
                          bookmarkPending={bookmarkPendingIds.has(resource.id)}
                          compareDisabled={comparisonCourses.length >= 3}
                          compareSelected={comparisonCourses.some((course) => course.id === resource.id)}
                          feedbackPending={feedbackPendingIds.has(resource.id)}
                          featured={index === 0}
                          onBookmarkToggle={handleBookmarkToggle}
                          onCompareToggle={handleCompareToggle}
                          onFeedback={handleRecommendationFeedback}
                          onInteraction={recordInteraction}
                          personalized={personalized}
                          rank={resource.rank}
                          reason={resource.reason}
                          reasons={resource.reasons}
                          resource={resource}
                        />
                      ) : (
                        <CourseCard
                          bookmarkPending={bookmarkPendingIds.has(resource.id)}
                          compareDisabled={comparisonCourses.length >= 3}
                          compareSelected={comparisonCourses.some((course) => course.id === resource.id)}
                          layout={catalogueLayout}
                          onBookmarkToggle={handleBookmarkToggle}
                          onCompareToggle={handleCompareToggle}
                          onInteraction={recordInteraction}
                          reason={resource.reason}
                          resource={resource}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {viewMode !== "recommended" && (
                  <CataloguePagination disabled={loading} onPageChange={handlePageChange} pagination={pagination} />
                )}
              </>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-stone-300 px-6 py-14 text-center dark:border-stone-700">
                {viewMode === "completed" ? (
                  <CheckCircle aria-hidden="true" className="mx-auto text-terracotta-700 dark:text-terracotta-400" size={36} weight="bold" />
                ) : (
                  <Books aria-hidden="true" className="mx-auto text-terracotta-700 dark:text-terracotta-400" size={36} weight="bold" />
                )}
                <h3 className="mt-4 font-display text-xl font-bold">
                  {viewMode === "completed"
                    ? "No completed courses match"
                    : viewMode === "recommended"
                      ? "No recommendations yet"
                      : "No courses match these filters"}
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600 dark:text-stone-400">
                  {viewMode === "completed"
                    ? "Mark a course as completed from its details page, or adjust these filters to find one you finished."
                    : viewMode === "recommended"
                      ? "Browse and save a few courses from the main catalogue, and recommendations will appear here."
                      : "Try a broader search term or remove one of the catalogue filters."}
                </p>
                {hasActiveFilters && viewMode !== "recommended" && (
                  <button
                    className="mt-5 min-h-11 rounded-xl bg-terracotta-800 px-4 text-sm font-bold text-stone-50 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950 dark:focus-visible:outline-terracotta-400"
                    onClick={clearFilters}
                    type="button"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      </main>

      {comparisonCourses.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-[calc(100%-2rem)] max-w-xl items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white/95 px-4 py-3 shadow-[0_20px_60px_rgb(28_25_23/0.2)] backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/95">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold"><ArrowsLeftRight aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={18} weight="bold" /> {comparisonCourses.length} of 3 selected</p>
            <p className="mt-0.5 truncate text-xs text-stone-500 dark:text-stone-400">{comparisonCourses.map((course) => course.title).join(" / ")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="min-h-10 rounded-xl px-3 text-xs font-bold text-stone-600 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] dark:text-stone-300 dark:hover:bg-stone-800" onClick={() => setComparisonCourses([])} type="button">Clear</button>
            <button className="inline-flex min-h-10 items-center justify-center rounded-xl bg-terracotta-800 px-4 text-xs font-bold text-white focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-terracotta-400 dark:text-stone-950" disabled={comparisonCourses.length < 2} onClick={() => setComparisonOpen(true)} type="button">Compare</button>
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

      {feedbackNotice && (
        <div
          aria-live="polite"
          className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-2xl border border-stone-700 bg-stone-950 px-4 py-3 text-stone-100 shadow-[0_20px_60px_rgb(0_0_0/0.28)] sm:bottom-6 sm:px-5"
          role="status"
        >
          <CheckCircle
            aria-hidden="true"
            className="shrink-0 text-terracotta-400"
            size={22}
            weight="fill"
          />
          <p className="min-w-0 flex-1 text-sm font-semibold leading-5">
            {feedbackNotice.message}
          </p>
          {feedbackNotice.canUndo && (
            <button
              className="min-h-9 shrink-0 rounded-lg px-2.5 text-sm font-bold text-terracotta-300 transition-colors hover:bg-stone-800 hover:text-terracotta-200 focus-visible:outline-2 focus-visible:outline-terracotta-400 active:scale-[0.97]"
              onClick={undoRecommendationFeedback}
              type="button"
            >
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss feedback message"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-100 focus-visible:outline-2 focus-visible:outline-terracotta-400 active:scale-[0.97]"
            onClick={() => setFeedbackNotice(null)}
            type="button"
          >
            <X aria-hidden="true" size={18} weight="bold" />
          </button>
        </div>
      )}

      <Footer />
    </div>
  );
}
