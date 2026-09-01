import {
  ArrowSquareOut,
  BookmarkSimple,
  Books,
  CheckCircle,
  ClockCounterClockwise,
  Eye,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import { createElement, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import client from "../api/client";
import SafeExternalLink from "../components/SafeExternalLink";
import CataloguePagination from "../components/dashboard/CataloguePagination";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import { LoadingRegion, Skeleton } from "../components/ui/Skeleton";
import useAuth from "../context/useAuth";

const TABS = [
  { key: "all", label: "All activity", icon: ClockCounterClockwise },
  { key: "completed", label: "Completed", icon: CheckCircle },
  { key: "saved", label: "Saved", icon: BookmarkSimple },
  { key: "clicked", label: "Opened courses", icon: ArrowSquareOut },
  { key: "viewed", label: "Viewed", icon: Eye },
];

const SIGNAL_META = {
  completed: { label: "Completed", icon: CheckCircle },
  saved: { label: "Saved", icon: BookmarkSimple },
  clicked: { label: "Opened", icon: ArrowSquareOut },
  viewed: { label: "Viewed", icon: Eye },
};

const EMPTY_PAGINATION = { page: 1, perPage: 12, total: 0, pages: 0, hasNext: false, hasPrevious: false };

// The 8-interaction cap mirrors CF_WEIGHT_CAP / CF_WEIGHT_SLOPE in the backend recommender (0.6 / 0.075).
const FULL_PERSONALIZATION_THRESHOLD = 8;

function getActivityType(searchParams) {
  const requested = searchParams.get("type");
  return TABS.some((tab) => tab.key === requested) ? requested : "all";
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (first, second) => (
    first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth()
    && first.getDate() === second.getDate()
  );

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function ActivityRow({ activityType, entry, bookmarkPending, onBookmarkToggle, onOpenCourse }) {
  const { resource, viewCount, outboundClickCount, strongestSignal, lastActivityAt } = entry;
  const displaySignal = activityType === "all" ? strongestSignal : activityType;
  const SignalIcon = SIGNAL_META[displaySignal].icon;

  const detailParts = [resource.provider, SIGNAL_META[displaySignal].label];
  if (viewCount > 0) detailParts.push(`viewed ${viewCount}x`);
  if (outboundClickCount > 0) detailParts.push(`opened ${outboundClickCount}x`);

  return (
    <article className="flex flex-wrap items-center gap-4 border-b border-stone-200 py-5 last:border-b-0 dark:border-stone-800">
      <span
        aria-hidden="true"
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${
          displaySignal === "saved" || displaySignal === "completed"
            ? "bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300"
            : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
        }`}
      >
        <SignalIcon size={20} weight={displaySignal === "saved" || displaySignal === "completed" ? "fill" : "bold"} />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="font-display text-base font-bold tracking-tight sm:truncate">
          <Link
            className="hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:hover:text-terracotta-300 dark:focus-visible:outline-terracotta-400"
            to={`/resources/${resource.id}`}
          >
            {resource.title}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-stone-600 sm:truncate dark:text-stone-400">{detailParts.join(" / ")}</p>
      </div>

      <time
        className="shrink-0 text-sm text-stone-500 dark:text-stone-400"
        dateTime={lastActivityAt}
        title={new Date(lastActivityAt).toLocaleString()}
      >
        {formatDate(lastActivityAt)}
      </time>

      <SafeExternalLink
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-stone-300 px-2.5 text-xs font-bold text-stone-700 transition-colors hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300 dark:focus-visible:outline-terracotta-400"
        href={resource.url}
        onClick={() => onOpenCourse(resource.id)}
      >
        <ArrowSquareOut aria-hidden="true" size={16} weight="bold" />
        Open
      </SafeExternalLink>

      <button
        aria-label={resource.isBookmarked ? `Remove ${resource.title} from saved courses` : `Save ${resource.title}`}
        aria-pressed={resource.isBookmarked}
        className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:outline-terracotta-400 ${
          resource.isBookmarked
            ? "border-terracotta-700 bg-terracotta-100 text-terracotta-950 dark:border-terracotta-400 dark:bg-terracotta-950 dark:text-terracotta-200"
            : "border-stone-300 text-stone-700 hover:border-terracotta-700 hover:text-terracotta-800 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
        }`}
        disabled={bookmarkPending}
        onClick={() => onBookmarkToggle(resource)}
        type="button"
      >
        {bookmarkPending ? (
          <SpinnerGap aria-hidden="true" className="motion-safe:animate-spin" size={16} weight="bold" />
        ) : (
          <BookmarkSimple aria-hidden="true" size={16} weight={resource.isBookmarked ? "fill" : "bold"} />
        )}
        {resource.isBookmarked ? "Saved" : "Save"}
      </button>
    </article>
  );
}

export default function Activity() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activityType, setActivityType] = useState(() => getActivityType(searchParams));
  const [activity, setActivity] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [bookmarkPendingIds, setBookmarkPendingIds] = useState(new Set());
  const [bookmarkError, setBookmarkError] = useState("");

  const fetchActivity = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/activity", {
        params: { type: activityType, page, per_page: 12 },
        signal,
      });
      setActivity(data.activity);
      setPagination(data.pagination);
      setStats(data.stats);
    } catch (requestError) {
      if (requestError.code !== "ERR_CANCELED") {
        setError(requestError.response?.data?.message || "Your activity could not be loaded. Please try again.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [activityType, page]);

  useEffect(() => {
    const controller = new AbortController();
    fetchActivity(controller.signal);
    return () => controller.abort();
  }, [fetchActivity, requestVersion]);

  useEffect(() => {
    setActivityType(getActivityType(searchParams));
    setPage(1);
    setBookmarkError("");
  }, [searchParams]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function handleTabChange(nextType) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextType === "all") {
      nextParams.delete("type");
    } else {
      nextParams.set("type", nextType);
    }
    setSearchParams(nextParams, { replace: true });
  }

  function handlePageChange(nextPage) {
    setPage(nextPage);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
  }

  async function handleBookmarkToggle(resource) {
    const nextBookmarked = !resource.isBookmarked;
    setBookmarkError("");
    setBookmarkPendingIds((current) => new Set(current).add(resource.id));
    setActivity((current) =>
      current.map((entry) =>
        entry.resource.id === resource.id
          ? {
              ...entry,
              resource: { ...entry.resource, isBookmarked: nextBookmarked },
              strongestSignal: entry.resource.isCompleted
                ? "completed"
                : nextBookmarked
                  ? "saved"
                  : entry.outboundClickCount > 0
                    ? "clicked"
                    : "viewed",
            }
          : entry,
      ),
    );

    try {
      if (nextBookmarked) {
        await client.post(`/bookmarks/${resource.id}`);
      } else {
        await client.delete(`/bookmarks/${resource.id}`);
      }
      if (activityType === "saved" && !nextBookmarked && activity.length === 1 && page > 1) {
        setPage((current) => current - 1);
      } else {
        setRequestVersion((version) => version + 1);
      }
    } catch (requestError) {
      setBookmarkError(
        requestError.response?.data?.message || "Your saved courses could not be updated. Please try again.",
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

  function handleOpenCourse(resourceId) {
    client.post("/interactions", { resourceId, type: "outbound_click" })
      .then(() => setRequestVersion((version) => version + 1))
      .catch(() => {
        // Provider navigation should not be blocked by analytics failure.
      });
  }

  const remainingForFullPersonalization = stats
    ? Math.max(0, FULL_PERSONALIZATION_THRESHOLD - stats.interactionCount)
    : 0;

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <DashboardHeader onLogout={handleLogout} userName={user?.name || "Student"} />

      <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
          <header className="max-w-2xl">
            <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Your activity</h1>
            <p className="mt-3 max-w-lg text-base leading-7 text-stone-600 dark:text-stone-400">
              See every course you have viewed, opened, saved, or completed and how it shapes your recommendations.
            </p>
          </header>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
        {stats && (
          <div className="mt-6 rounded-2xl border border-stone-200 bg-white px-5 py-4 dark:border-stone-800 dark:bg-stone-900">
            <p className="font-semibold text-stone-900 dark:text-stone-100">
              You've engaged with {stats.interactionCount} course{stats.interactionCount === 1 ? "" : "s"}.
            </p>
            <p className="mt-1.5 text-sm leading-6 text-stone-600 dark:text-stone-400">
              Recommendations are currently{" "}
              <span className="font-semibold text-terracotta-800 dark:text-terracotta-300">
                {Math.round(stats.weightCollaborative * 100)}% based on your activity
              </span>
              {" "}and{" "}
              <span className="font-semibold text-terracotta-800 dark:text-terracotta-300">
                {Math.round(stats.weightContent * 100)}% based on your profile
              </span>
              {remainingForFullPersonalization > 0
                ? ` Explore ${remainingForFullPersonalization} more different course${remainingForFullPersonalization === 1 ? "" : "s"} to unlock full personalisation.`
                : "."}
            </p>
          </div>
        )}

        <nav aria-label="Activity views" className="mt-7 inline-flex flex-wrap rounded-xl border border-stone-300 bg-white p-1 dark:border-stone-700 dark:bg-stone-900">
          {TABS.map(({ key, label, icon }) => (
            <button
              aria-current={activityType === key ? "page" : undefined}
              className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:focus-visible:outline-terracotta-400 ${
                activityType === key
                  ? "bg-terracotta-800 text-white dark:bg-terracotta-400 dark:text-stone-950"
                  : "text-stone-600 hover:text-terracotta-800 dark:text-stone-400 dark:hover:text-terracotta-300"
              }`}
              key={key}
              onClick={() => handleTabChange(key)}
              type="button"
            >
              {createElement(icon, {
                "aria-hidden": true,
                size: 18,
                weight: activityType === key ? "fill" : "bold",
              })}
              {label}
            </button>
          ))}
        </nav>

        {bookmarkError && (
          <div className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
            {bookmarkError}
          </div>
        )}

        <section aria-busy={loading} className="mt-6 rounded-2xl border border-stone-200 bg-white px-5 dark:border-stone-800 dark:bg-stone-900 sm:px-6">
          {error ? (
            <div className="py-10 text-center">
              <WarningCircle aria-hidden="true" className="mx-auto text-red-700 dark:text-red-400" size={28} weight="bold" />
              <h2 className="mt-4 font-display text-lg font-bold">Unable to load your activity</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-600 dark:text-stone-400">{error}</p>
              <button
                className="mt-5 min-h-11 rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950"
                onClick={() => setRequestVersion((version) => version + 1)}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : loading ? (
            <LoadingRegion label="Loading your learning activity">
              <div className="divide-y divide-stone-200 dark:divide-stone-800">
                {Array.from({ length: 4 }, (_, index) => (
                  <div className="flex items-center gap-4 py-5" key={index}>
                    <Skeleton className="size-11 shrink-0 rounded-xl" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-4 w-2/5 min-w-28 rounded" />
                      <Skeleton className="h-3 w-3/5 min-w-36 rounded" />
                    </div>
                    <Skeleton className="hidden h-3 w-16 rounded sm:block" />
                    <Skeleton className="h-10 w-16 shrink-0 rounded-xl" />
                  </div>
                ))}
              </div>
            </LoadingRegion>
          ) : activity.length ? (
            <div>
              {activity.map((entry) => (
                <ActivityRow
                  activityType={activityType}
                  bookmarkPending={bookmarkPendingIds.has(entry.resource.id)}
                  entry={entry}
                  key={entry.resource.id}
                  onBookmarkToggle={handleBookmarkToggle}
                  onOpenCourse={handleOpenCourse}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Books aria-hidden="true" className="mx-auto text-terracotta-700 dark:text-terracotta-300" size={32} weight="bold" />
              <h2 className="mt-4 font-display text-lg font-bold">Nothing here yet</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-600 dark:text-stone-400">
                Browse the catalogue and view, save, open, or complete a course. Your activity will start showing up here.
              </p>
              <Link
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950"
                to="/catalogue"
              >
                Explore courses
              </Link>
            </div>
          )}

          {!error && !loading && activity.length > 0 && (
            <CataloguePagination disabled={loading} onPageChange={handlePageChange} pagination={pagination} />
          )}
        </section>
      </main>
    </div>
  );
}
