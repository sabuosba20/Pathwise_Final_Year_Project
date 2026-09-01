import {
  ArrowRight,
  BookmarkSimple,
  Books,
  CaretRight,
  CheckCircle,
  Compass,
  Flag,
  PlayCircle,
  Target,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import client from "../api/client";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import RecommendationCard, {
  RecommendationCardSkeleton,
} from "../components/dashboard/RecommendationCard";
import { LoadingRegion, Skeleton } from "../components/ui/Skeleton";
import useAuth from "../context/useAuth";

const EMPTY_PROFILE = {
  fieldOfStudy: "",
  skills: "",
  learningGoals: "",
};

const CONTINUE_SIGNAL_LABEL = {
  completed: "Completed",
  saved: "Saved",
  clicked: "Opened",
  viewed: "Viewed",
};

function formatActivityDate(isoDate) {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (first, second) =>
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();

  if (isSameDay(date, today)) return "today";
  if (isSameDay(date, yesterday)) return "yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function mapRecommendations(data) {
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

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [recommendations, setRecommendations] = useState([]);
  const [personalized, setPersonalized] = useState(false);
  const [continueEntry, setContinueEntry] = useState(null);
  const [savedCourses, setSavedCourses] = useState([]);
  const [savedTotal, setSavedTotal] = useState(0);
  const [completedCourses, setCompletedCourses] = useState([]);
  const [completedTotal, setCompletedTotal] = useState(0);
  const [activeGoals, setActiveGoals] = useState([]);
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);
  const [bookmarkPendingIds, setBookmarkPendingIds] = useState(new Set());
  const [bookmarkError, setBookmarkError] = useState("");
  const [feedbackPendingIds, setFeedbackPendingIds] = useState(new Set());
  const [feedbackError, setFeedbackError] = useState("");
  const recommendationRefreshRef = useRef(0);

  const loadDashboard = useCallback(async (signal) => {
    setLoading(true);
    setError("");

    try {
      const [
        recommendationResponse,
        savedResponse,
        completedResponse,
        preferencesResponse,
        activityResponse,
        goalsResponse,
      ] = await Promise.all([
        client.get("/recommendations", { params: { limit: 3 }, signal }),
        client.get("/resources", {
          params: { bookmarked: true, per_page: 3 },
          signal,
        }),
        client.get("/resources", {
          params: { completed: true, sort: "completed", per_page: 2 },
          signal,
        }),
        client.get("/preferences", { signal }),
        client.get("/activity", { params: { per_page: 5 }, signal }),
        client.get("/goals", { params: { status: "active" }, signal }),
      ]);

      setRecommendations(mapRecommendations(recommendationResponse.data));
      setPersonalized(recommendationResponse.data.personalized);
      setSavedCourses(savedResponse.data.resources);
      setSavedTotal(savedResponse.data.pagination.total);
      setCompletedCourses(completedResponse.data.resources);
      setCompletedTotal(completedResponse.data.pagination.total);
      setProfile(preferencesResponse.data.preference || EMPTY_PROFILE);
      setActiveGoals(goalsResponse.data.goals);
      const activeEntries = activityResponse.data.activity.filter(
        (entry) => !entry.resource.isCompleted,
      );
      setContinueEntry(
        activeEntries.find((entry) =>
          ["clicked", "viewed"].includes(entry.strongestSignal),
        ) ||
          activeEntries[0] ||
          null,
      );
    } catch (requestError) {
      if (requestError.code !== "ERR_CANCELED") {
        setError(
          requestError.response?.data?.message ||
            "Your learning home could not be loaded. Please try again.",
        );
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    return () => controller.abort();
  }, [loadDashboard, requestVersion]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function refreshRecommendations() {
    // Concurrent feedback clicks on different cards each trigger their own
    // refresh; only apply the response from the most recently issued
    // request, so an older one resolving late can't clobber a newer ranking.
    const requestId = ++recommendationRefreshRef.current;
    const { data } = await client.get("/recommendations", {
      params: { limit: 3 },
    });
    if (requestId !== recommendationRefreshRef.current) return;
    setRecommendations(mapRecommendations(data));
    setPersonalized(data.personalized);
  }

  function recordInteraction(resourceId, type) {
    client.post("/interactions", { resourceId, type }).catch(() => {});
  }

  async function handleBookmarkToggle(resource) {
    const nextBookmarked = !resource.isBookmarked;
    setBookmarkError("");
    setBookmarkPendingIds((current) => new Set(current).add(resource.id));
    setRecommendations((current) =>
      current.map((item) =>
        item.id === resource.id
          ? { ...item, isBookmarked: nextBookmarked }
          : item,
      ),
    );

    try {
      if (nextBookmarked) {
        await client.post(`/bookmarks/${resource.id}`);
      } else {
        await client.delete(`/bookmarks/${resource.id}`);
      }
      setSavedTotal((current) =>
        Math.max(0, current + (nextBookmarked ? 1 : -1)),
      );
    } catch (requestError) {
      setRecommendations((current) =>
        current.map((item) =>
          item.id === resource.id
            ? { ...item, isBookmarked: !nextBookmarked }
            : item,
        ),
      );
      setBookmarkError(
        requestError.response?.data?.message ||
          "Your saved courses could not be updated. Please try again.",
      );
    } finally {
      setBookmarkPendingIds((current) => {
        const next = new Set(current);
        next.delete(resource.id);
        return next;
      });
    }
  }

  async function handleRecommendationFeedback(resource, feedbackType) {
    setFeedbackError("");
    setFeedbackPendingIds((current) => new Set(current).add(resource.id));

    if (feedbackType === "not_interested") {
      setRecommendations((current) =>
        current.filter((item) => item.id !== resource.id),
      );
    } else {
      setRecommendations((current) =>
        current.map((item) =>
          item.id === resource.id ? { ...item, feedbackType } : item,
        ),
      );
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
      await refreshRecommendations();
    } catch (requestError) {
      setFeedbackError(
        requestError.response?.data?.message ||
          "Your recommendation feedback could not be updated. Please try again.",
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

  const firstName = user?.name?.trim().split(/\s+/)[0] || "Student";
  const continueActionLabel = ["clicked", "viewed"].includes(
    continueEntry?.strongestSignal,
  )
    ? "Resume"
    : "View course";
  const continueDate = formatActivityDate(continueEntry?.lastActivityAt);

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <DashboardHeader
        onLogout={handleLogout}
        userName={user?.name || "Student"}
      />

      <main>
        <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-3 py-6 sm:px-4 lg:px-6">
            <div className="min-w-0">
              <p className="text-sm font-bold text-terracotta-800 dark:text-terracotta-300">
                Your learning home
              </p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Welcome back, {firstName}.
              </h1>
              {!loading && (profile.fieldOfStudy || profile.learningGoals) && (
                <p className="mt-1.5 max-w-xl text-sm leading-6 text-stone-600 dark:text-stone-400">
                  {[profile.fieldOfStudy, profile.learningGoals]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            <Link
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-stone-300 px-5 text-sm font-bold text-stone-800 transition-colors hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:border-stone-700 dark:text-stone-100 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
              to="/catalogue"
            >
              Browse catalogue
              <ArrowRight aria-hidden="true" size={18} weight="bold" />
            </Link>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-3 pb-10 pt-8 sm:px-4 sm:pb-12 lg:px-6 lg:pt-10">
          {error ? (
            <section
              className="mt-8 rounded-2xl border border-red-300 bg-red-50 p-6 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
              role="alert"
            >
              <WarningCircle aria-hidden="true" size={30} weight="bold" />
              <h2 className="mt-4 font-display text-xl font-bold">
                Unable to load your home
              </h2>
              <p className="mt-2 text-sm leading-6">{error}</p>
              <button
                className="mt-5 min-h-11 rounded-xl bg-red-900 px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-red-800 active:translate-y-px dark:bg-red-200 dark:text-red-950"
                onClick={() => setRequestVersion((version) => version + 1)}
                type="button"
              >
                Try again
              </button>
            </section>
          ) : (
            <>
              {loading ? (
                <div aria-hidden="true" className="mb-8">
                  <Skeleton className="h-[5.5rem] w-full rounded-2xl" />
                </div>
              ) : continueEntry ? (
                <section className="mb-8 flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800 dark:bg-stone-900">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300">
                      <PlayCircle aria-hidden="true" size={23} weight="fill" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wide text-terracotta-800 dark:text-terracotta-300">
                        Continue learning
                      </p>
                      <h2 className="mt-1 line-clamp-1 font-display text-lg font-bold leading-snug text-stone-950 dark:text-stone-100">
                        {continueEntry.resource.title}
                      </h2>
                      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                        {continueEntry.resource.provider}
                        {" · "}
                        {CONTINUE_SIGNAL_LABEL[continueEntry.strongestSignal] ||
                          "Viewed"}
                        {continueDate && ` ${continueDate}`}
                      </p>
                    </div>
                  </div>
                  <Link
                    className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white transition-colors hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300"
                    to={`/resources/${continueEntry.resource.id}`}
                  >
                    {continueActionLabel}
                    <ArrowRight aria-hidden="true" size={17} weight="bold" />
                  </Link>
                </section>
              ) : null}

              {bookmarkError && (
                <div
                  className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                  role="alert"
                >
                  {bookmarkError}
                </div>
              )}
              {feedbackError && (
                <div
                  className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                  role="alert"
                >
                  {feedbackError}
                </div>
              )}

              <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12">
                <section
                  aria-busy={loading}
                  aria-labelledby="recommendations-title"
                  className="min-w-0"
                >
                  <div className="flex items-end justify-between gap-5">
                    <div>
                      <h2
                        className="font-display text-2xl font-bold tracking-tight sm:text-3xl"
                        id="recommendations-title"
                      >
                        Recommended for you
                      </h2>
                    </div>
                    <Link
                      className="hidden shrink-0 items-center gap-1.5 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 sm:inline-flex dark:text-terracotta-300 dark:hover:text-terracotta-200"
                      to="/catalogue?view=recommended"
                    >
                      View all
                      <ArrowRight aria-hidden="true" size={17} weight="bold" />
                    </Link>
                  </div>

                  {loading ? (
                    <LoadingRegion
                      className="mt-6"
                      label="Loading your recommendations"
                    >
                      <div className="grid gap-5 md:grid-cols-2">
                        <div className="md:col-span-2">
                          <RecommendationCardSkeleton featured />
                        </div>
                        <RecommendationCardSkeleton />
                        <RecommendationCardSkeleton />
                      </div>
                    </LoadingRegion>
                  ) : recommendations.length ? (
                    <div className="mt-6 grid gap-5 md:grid-cols-2">
                      {recommendations.map((resource, index) => (
                        <div
                          className={index === 0 ? "md:col-span-2" : ""}
                          key={resource.id}
                        >
                          <RecommendationCard
                            bookmarkPending={bookmarkPendingIds.has(
                              resource.id,
                            )}
                            feedbackPending={feedbackPendingIds.has(
                              resource.id,
                            )}
                            featured={index === 0}
                            onBookmarkToggle={handleBookmarkToggle}
                            onFeedback={handleRecommendationFeedback}
                            onInteraction={recordInteraction}
                            personalized={personalized}
                            rank={resource.rank}
                            reason={resource.reason}
                            reasons={resource.reasons}
                            resource={resource}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-6 rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-stone-700">
                      <Compass
                        aria-hidden="true"
                        className="mx-auto text-terracotta-700 dark:text-terracotta-300"
                        size={34}
                        weight="bold"
                      />
                      <h3 className="mt-4 font-display text-xl font-bold">
                        Your next course starts here
                      </h3>
                      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-stone-600 dark:text-stone-400">
                        Browse the catalogue and save courses to help Pathwise
                        understand what you want to learn.
                      </p>
                      <Link
                        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950"
                        to="/catalogue"
                      >
                        Explore courses
                      </Link>
                    </div>
                  )}
                </section>

                <aside className="space-y-6">
                  <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                    <div className="flex items-start gap-3">
                      <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300">
                        <Target aria-hidden="true" size={21} weight="bold" />
                      </span>
                      <div className="min-w-0">
                        <h2 className="font-display text-lg font-bold">
                          Your learning focus
                        </h2>
                        {loading ? (
                          <LoadingRegion
                            className="mt-2"
                            label="Loading your learning focus"
                          >
                            <Skeleton className="h-3 w-44 rounded" />
                            <Skeleton className="mt-2 h-3 w-32 rounded" />
                          </LoadingRegion>
                        ) : (
                          <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">
                            {profile.fieldOfStudy ||
                              "Add your degree programme to improve recommendations."}
                          </p>
                        )}
                      </div>
                    </div>

                    {!loading && profile.learningGoals && (
                      <p className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm leading-6 text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                        {profile.learningGoals}
                      </p>
                    )}

                    <Link
                      className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-terracotta-300 dark:hover:text-terracotta-200"
                      to="/settings"
                    >
                      <UserCircle aria-hidden="true" size={18} weight="bold" />
                      Edit learning profile
                    </Link>
                  </section>

                  <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-display text-lg font-bold">
                          Your goals
                        </h2>
                        {loading ? (
                          <LoadingRegion
                            className="mt-2"
                            label="Loading your goals"
                          >
                            <Skeleton className="h-3 w-20 rounded" />
                          </LoadingRegion>
                        ) : (
                          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                            {activeGoals.length} active
                          </p>
                        )}
                      </div>
                      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300">
                        <Flag aria-hidden="true" size={21} weight="fill" />
                      </span>
                    </div>

                    {!loading && activeGoals.length > 0 ? (
                      <div className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-800">
                        {activeGoals.slice(0, 2).map((goal) => (
                          <div key={goal.id}>
                            <p className="line-clamp-1 text-sm font-semibold text-stone-800 dark:text-stone-200">
                              {goal.title}
                            </p>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                              <div
                                className="h-full rounded-full bg-terracotta-700 dark:bg-terracotta-400"
                                style={{
                                  width: `${Math.min(100, Math.max(0, goal.progress.percent))}%`,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : !loading ? (
                      <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">
                        Set a goal around the skills you want to build and track
                        progress here.
                      </p>
                    ) : null}

                    <Link
                      className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-terracotta-300 dark:hover:text-terracotta-200"
                      to="/goals"
                    >
                      <Target aria-hidden="true" size={18} weight="bold" />
                      View your goals
                    </Link>
                  </section>

                  <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-display text-lg font-bold">
                          Saved courses
                        </h2>
                        {loading ? (
                          <LoadingRegion
                            className="mt-2"
                            label="Loading saved courses"
                          >
                            <Skeleton className="h-3 w-16 rounded" />
                          </LoadingRegion>
                        ) : (
                          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                            {savedTotal} saved
                          </p>
                        )}
                      </div>
                      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300">
                        <BookmarkSimple
                          aria-hidden="true"
                          size={21}
                          weight="fill"
                        />
                      </span>
                    </div>

                    {loading ? (
                      <div
                        aria-hidden="true"
                        className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-800"
                      >
                        <Skeleton className="h-4 w-11/12 rounded" />
                        <Skeleton className="h-4 w-4/5 rounded" />
                      </div>
                    ) : savedCourses.length > 0 ? (
                      <div className="mt-4 border-t border-stone-200 dark:border-stone-800">
                        {savedCourses.slice(0, 2).map((course) => (
                          <Link
                            className="group flex items-center justify-between gap-3 border-b border-stone-200 py-3 text-sm font-semibold text-stone-800 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:border-stone-800 dark:text-stone-200 dark:hover:text-terracotta-300"
                            key={course.id}
                            to={`/resources/${course.id}`}
                          >
                            <span className="line-clamp-2">{course.title}</span>
                            <CaretRight
                              aria-hidden="true"
                              className="shrink-0 transition-transform group-hover:translate-x-1"
                              size={17}
                              weight="bold"
                            />
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">
                        Save useful courses so you can return to them quickly.
                      </p>
                    )}

                    <Link
                      className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-terracotta-300 dark:hover:text-terracotta-200"
                      to="/profile?tab=saved"
                    >
                      <Books aria-hidden="true" size={18} weight="bold" />
                      View saved courses
                    </Link>
                  </section>

                  <section className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-display text-lg font-bold">
                          Completed courses
                        </h2>
                        {loading ? (
                          <LoadingRegion
                            className="mt-2"
                            label="Loading completed courses"
                          >
                            <Skeleton className="h-3 w-20 rounded" />
                          </LoadingRegion>
                        ) : (
                          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                            {completedTotal} completed
                          </p>
                        )}
                      </div>
                      <span className="inline-flex size-10 items-center justify-center rounded-xl bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300">
                        <CheckCircle
                          aria-hidden="true"
                          size={22}
                          weight="fill"
                        />
                      </span>
                    </div>

                    {!loading && completedCourses.length > 0 ? (
                      <div className="mt-4 border-t border-stone-200 dark:border-stone-800">
                        {completedCourses.map((course) => (
                          <Link
                            className="group flex items-center justify-between gap-3 border-b border-stone-200 py-3 text-sm font-semibold text-stone-800 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:border-stone-800 dark:text-stone-200 dark:hover:text-terracotta-300"
                            key={course.id}
                            to={`/resources/${course.id}`}
                          >
                            <span className="line-clamp-2">{course.title}</span>
                            <CaretRight
                              aria-hidden="true"
                              className="shrink-0 transition-transform group-hover:translate-x-1"
                              size={17}
                              weight="bold"
                            />
                          </Link>
                        ))}
                      </div>
                    ) : !loading ? (
                      <p className="mt-4 text-sm leading-6 text-stone-600 dark:text-stone-400">
                        Courses you finish will appear here and guide what
                        Pathwise recommends next.
                      </p>
                    ) : null}

                    <Link
                      className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-terracotta-300 dark:hover:text-terracotta-200"
                      to="/activity?type=completed"
                    >
                      View completed courses
                      <ArrowRight aria-hidden="true" size={17} weight="bold" />
                    </Link>
                  </section>
                </aside>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
