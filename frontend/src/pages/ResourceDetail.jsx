import {
  ArrowLeft,
  ArrowSquareOut,
  BookmarkSimple,
  BookOpenText,
  CheckCircle,
  SpinnerGap,
  Star,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import client from "../api/client";
import SafeExternalLink from "../components/SafeExternalLink";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Footer from "../components/Footer";
import { LoadingRegion, Skeleton } from "../components/ui/Skeleton";
import useAuth from "../context/useAuth";

function FactRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
      <dt className="text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="font-semibold text-stone-900 dark:text-stone-100">{value}</dd>
    </div>
  );
}

const RATING_LABELS = {
  1: "Not useful",
  2: "Below expectations",
  3: "Useful",
  4: "Very useful",
  5: "Excellent",
};

function formatCompletionDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function parseResourceId(value) {
  if (!/^[1-9]\d*$/.test(value || "")) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export default function ResourceDetail() {
  const { id } = useParams();
  const resourceId = parseResourceId(id);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [resource, setResource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [ratingPending, setRatingPending] = useState(false);
  const [ratingPreview, setRatingPreview] = useState(null);
  const [ratingError, setRatingError] = useState("");
  const [ratingNotice, setRatingNotice] = useState("");
  const [completionPending, setCompletionPending] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const viewRecorded = useRef(false);

  useEffect(() => {
    viewRecorded.current = false;
    setLoading(true);
    setError("");
    setRatingError("");
    setRatingNotice("");
    setCompletionError("");

    if (resourceId === null) {
      setResource(null);
      setError("This course URL is invalid.");
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    client
      .get(`/resources/${resourceId}`, { signal: controller.signal })
      .then(({ data }) => {
        setResource(data.resource);
        if (!viewRecorded.current) {
          viewRecorded.current = true;
          client.post("/interactions", { resourceId, type: "view" }).catch(() => {
            // Reading course details should not be blocked by analytics failure.
          });
        }
      })
      .catch((requestError) => {
        if (requestError.code !== "ERR_CANCELED") {
          setError(requestError.response?.data?.message || "This course could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [resourceId]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function handleBookmarkToggle() {
    if (!resource) return;
    const nextBookmarked = !resource.isBookmarked;
    setBookmarkPending(true);
    setResource((current) => ({ ...current, isBookmarked: nextBookmarked }));

    try {
      if (nextBookmarked) {
        await client.post(`/bookmarks/${resource.id}`);
      } else {
        await client.delete(`/bookmarks/${resource.id}`);
      }
    } catch {
      setResource((current) => ({ ...current, isBookmarked: !nextBookmarked }));
    } finally {
      setBookmarkPending(false);
    }
  }

  function recordOutboundClick() {
    if (!resource) return;
    client.post("/interactions", { resourceId: resource.id, type: "outbound_click" }).catch(() => {});
  }

  async function handleRating(nextRating) {
    if (!resource || ratingPending) return;
    setRatingPending(true);
    setRatingError("");
    setRatingNotice("");

    try {
      const { data } = await client.put(`/resources/${resource.id}/rating`, {
        rating: nextRating,
      });
      setResource((current) => ({ ...current, ...data.rating }));
      setRatingNotice(`Saved as ${nextRating} out of 5: ${RATING_LABELS[nextRating]}.`);
    } catch (requestError) {
      setRatingError(
        requestError.response?.data?.message
          || "Your rating could not be saved. Please try again.",
      );
    } finally {
      setRatingPending(false);
      setRatingPreview(null);
    }
  }

  async function handleRemoveRating() {
    if (!resource || ratingPending) return;
    setRatingPending(true);
    setRatingError("");
    setRatingNotice("");

    try {
      const { data } = await client.delete(`/resources/${resource.id}/rating`);
      setResource((current) => ({ ...current, ...data.rating }));
      setRatingNotice("Your rating was removed.");
    } catch (requestError) {
      setRatingError(
        requestError.response?.data?.message
          || "Your rating could not be removed. Please try again.",
      );
    } finally {
      setRatingPending(false);
      setRatingPreview(null);
    }
  }

  async function handleCompletionToggle() {
    if (!resource || completionPending) return;
    setCompletionPending(true);
    setCompletionError("");

    try {
      const { data } = resource.isCompleted
        ? await client.delete(`/resources/${resource.id}/completion`)
        : await client.post(`/resources/${resource.id}/completion`);
      setResource((current) => ({ ...current, ...data.completion }));
    } catch (requestError) {
      setCompletionError(
        requestError.response?.data?.message
          || "Your completion status could not be updated. Please try again.",
      );
    } finally {
      setCompletionPending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <DashboardHeader onLogout={handleLogout} userName={user?.name || "Student"} />

      {error ? (
        <main className="mx-auto max-w-3xl px-3 py-10 sm:px-4 lg:px-6">
          <Link className="inline-flex items-center gap-2 text-sm font-bold text-stone-600 hover:text-terracotta-800 dark:text-stone-400 dark:hover:text-terracotta-300" to="/catalogue">
            <ArrowLeft aria-hidden="true" size={16} weight="bold" />
            Back to catalogue
          </Link>
          <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-6 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
            <WarningCircle aria-hidden="true" size={28} weight="bold" />
            <h1 className="mt-4 font-display text-lg font-bold">Unable to load this course</h1>
            <p className="mt-2 text-sm leading-6">{error}</p>
          </div>
        </main>
      ) : loading || !resource ? (
        <LoadingRegion label="Loading course details">
          <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            <div className="mx-auto max-w-6xl px-3 py-10 sm:px-4 lg:px-6 lg:py-14">
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="mt-7 h-3 w-28 rounded" />
              <Skeleton className="mt-4 h-10 w-3/4 max-w-3xl rounded-lg" />
              <Skeleton className="mt-3 h-10 w-1/2 max-w-2xl rounded-lg" />
              <div className="mt-6 flex flex-wrap gap-4">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-4 w-20 rounded" />
              </div>
            </div>
          </section>
          <main className="mx-auto max-w-6xl px-3 py-10 sm:px-4 lg:px-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
              <div>
                <Skeleton className="h-6 w-40 rounded" />
                <div className="mt-5 space-y-3">
                  <Skeleton className="h-4 w-full rounded" />
                  <Skeleton className="h-4 w-11/12 rounded" />
                  <Skeleton className="h-4 w-4/5 rounded" />
                  <Skeleton className="h-4 w-2/3 rounded" />
                </div>
                <div className="mt-10 border-t border-stone-200 pt-8 dark:border-stone-800">
                  <Skeleton className="h-6 w-32 rounded" />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Skeleton className="h-8 w-24 rounded-lg" />
                    <Skeleton className="h-8 w-32 rounded-lg" />
                    <Skeleton className="h-8 w-20 rounded-lg" />
                  </div>
                </div>
              </div>
              <aside className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="mt-3 h-12 w-full rounded-xl" />
                <div className="mt-5 space-y-4 border-t border-stone-200 pt-5 dark:border-stone-800">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div className="flex justify-between gap-4" key={index}>
                      <Skeleton className="h-3 w-16 rounded" />
                      <Skeleton className="h-3 w-24 rounded" />
                    </div>
                  ))}
                </div>
              </aside>
            </div>
          </main>
        </LoadingRegion>
      ) : (
        <>
          {/* Full-bleed hero band: title and key facts live in the page canvas
              itself rather than inside a boxed card. */}
          <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
            <div className="mx-auto max-w-6xl px-3 py-10 sm:px-4 lg:px-6 lg:py-14">
              <Link className="inline-flex items-center gap-2 text-sm font-bold text-stone-600 hover:text-terracotta-800 dark:text-stone-400 dark:hover:text-terracotta-300" to="/catalogue">
                <ArrowLeft aria-hidden="true" size={16} weight="bold" />
                Back to catalogue
              </Link>

              <p className="mt-6 text-sm font-bold uppercase tracking-wide text-terracotta-800 dark:text-terracotta-300">
                {resource.provider}
              </p>
              <h1 className="mt-2 max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight text-stone-950 dark:text-stone-100 sm:text-4xl">
                {resource.title}
              </h1>

              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-stone-600 dark:text-stone-400">
                <span className="inline-flex items-center gap-1.5">
                  <Star aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-400" size={17} weight={resource.rating == null ? "regular" : "fill"} />
                  {resource.rating == null ? "No provider rating" : `${resource.rating.toFixed(1)} provider rating`}
                </span>
                {resource.pathwiseRatingCount > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <Star aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-400" size={17} weight="fill" />
                    {resource.pathwiseRating.toFixed(1)} from Pathwise learners
                  </span>
                )}
                <span>{resource.category}</span>
                {resource.difficulty !== "Unknown" && <span>{resource.difficulty}</span>}
                {resource.resourceType !== "Course" && <span>{resource.resourceType}</span>}
              </div>
            </div>
          </section>

          <main className="mx-auto max-w-6xl px-3 py-10 sm:px-4 lg:px-6">
            <div className="grid gap-10 lg:grid-cols-[1fr_18rem]">
              <div className="min-w-0">
                <h2 className="font-display text-lg font-bold tracking-tight text-stone-950 dark:text-stone-100">About this course</h2>
                <p className="mt-3 max-w-prose leading-8 text-stone-700 dark:text-stone-300">
                  {resource.description || "This provider did not include a course description in the source dataset."}
                </p>

                {resource.skills.length > 0 && (
                  <div className="mt-10 border-t border-stone-200 pt-8 dark:border-stone-800">
                    <h2 className="font-display text-lg font-bold tracking-tight text-stone-950 dark:text-stone-100">Skills covered</h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {resource.skills.map((skill) => (
                        <span className="inline-flex min-h-8 items-center rounded-lg bg-terracotta-100 px-3 text-sm font-semibold text-terracotta-900 dark:bg-terracotta-950 dark:text-terracotta-200" key={skill}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {resource.fieldTags.length > 0 && (
                  <div className="mt-10 border-t border-stone-200 pt-8 dark:border-stone-800">
                    <h2 className="font-display text-lg font-bold tracking-tight text-stone-950 dark:text-stone-100">Relevant fields</h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {resource.fieldTags.map((tag) => (
                        <span className="inline-flex min-h-8 items-center rounded-lg bg-stone-100 px-3 text-sm font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300" key={tag}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action panel: the one deliberate card on the page, earning its
                  elevation by staying visible (sticky) while the description
                  scrolls, the way a real course platform's "enrol" box works. */}
              <aside className="h-fit lg:sticky lg:top-24">
                <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-[0_18px_50px_rgb(28_25_23/0.045)] dark:border-stone-800 dark:bg-stone-900 dark:shadow-none">
                  <div className="grid gap-2.5">
                    <button
                      aria-pressed={resource.isBookmarked}
                      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:outline-terracotta-400 ${resource.isBookmarked ? "border-terracotta-700 bg-terracotta-100 text-terracotta-950 dark:border-terracotta-400 dark:bg-terracotta-950 dark:text-terracotta-200" : "border-stone-300 text-stone-700 hover:border-terracotta-700 hover:text-terracotta-800 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"}`}
                      disabled={bookmarkPending}
                      onClick={handleBookmarkToggle}
                      type="button"
                    >
                      {bookmarkPending ? (
                        <SpinnerGap aria-hidden="true" className="motion-safe:animate-spin" size={18} weight="bold" />
                      ) : (
                        <BookmarkSimple aria-hidden="true" size={18} weight={resource.isBookmarked ? "fill" : "bold"} />
                      )}
                      {resource.isBookmarked ? "Saved" : "Save"}
                    </button>
                    <SafeExternalLink
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-terracotta-800 px-4 text-sm font-bold text-stone-50 transition-colors hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300 dark:focus-visible:outline-terracotta-400"
                      href={resource.url}
                      onClick={recordOutboundClick}
                    >
                      <BookOpenText aria-hidden="true" size={18} weight="bold" />
                      Open course
                      <ArrowSquareOut aria-hidden="true" size={17} weight="bold" />
                    </SafeExternalLink>
                  </div>

                  <section className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800" aria-labelledby="completion-title">
                    <h2 className="font-display text-base font-bold" id="completion-title">
                      Course progress
                    </h2>
                    {resource.isCompleted ? (
                      <div className="mt-3 rounded-xl border border-terracotta-200 bg-terracotta-50 p-3.5 dark:border-terracotta-900 dark:bg-terracotta-950/45">
                        <p className="flex items-center gap-2 text-sm font-bold text-terracotta-900 dark:text-terracotta-200">
                          <CheckCircle aria-hidden="true" size={20} weight="fill" />
                          Completed
                        </p>
                        <p className="mt-1.5 text-xs leading-5 text-stone-600 dark:text-stone-400">
                          Self-reported on {formatCompletionDate(resource.completedAt)}.
                        </p>
                        <button
                          className="mt-2 text-xs font-bold text-stone-600 underline decoration-stone-300 underline-offset-4 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-red-700 disabled:cursor-wait disabled:opacity-65 dark:text-stone-400 dark:decoration-stone-700 dark:hover:text-red-300"
                          disabled={completionPending}
                          onClick={handleCompletionToggle}
                          type="button"
                        >
                          {completionPending ? "Updating…" : "Undo completion"}
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                          Finished this course on the provider’s website? Record it here to improve what Pathwise recommends next.
                        </p>
                        <button
                          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 transition-colors hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-65 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
                          disabled={completionPending}
                          onClick={handleCompletionToggle}
                          type="button"
                        >
                          {completionPending ? (
                            <SpinnerGap aria-hidden="true" className="motion-safe:animate-spin" size={18} weight="bold" />
                          ) : (
                            <CheckCircle aria-hidden="true" size={19} weight="bold" />
                          )}
                          Mark as completed
                        </button>
                      </>
                    )}
                    {completionError && (
                      <p className="mt-3 text-xs font-semibold leading-5 text-red-800 dark:text-red-300" role="alert">
                        {completionError}
                      </p>
                    )}
                  </section>

                  <section className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800" aria-labelledby="course-rating-title">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-display text-base font-bold" id="course-rating-title">
                          Rate this course
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
                          {resource.pathwiseRatingCount > 0
                            ? `${resource.pathwiseRating.toFixed(1)} average from ${resource.pathwiseRatingCount} Pathwise ${resource.pathwiseRatingCount === 1 ? "learner" : "learners"}.`
                            : "Be the first Pathwise learner to rate it."}
                        </p>
                      </div>
                      {ratingPending && (
                        <SpinnerGap
                          aria-label="Saving rating"
                          className="mt-0.5 shrink-0 motion-safe:animate-spin text-terracotta-700 dark:text-terracotta-300"
                          size={19}
                          weight="bold"
                        />
                      )}
                    </div>

                    <fieldset className="mt-4" disabled={ratingPending}>
                      <legend className="sr-only">Choose a rating from 1 to 5</legend>
                      <div
                        className="flex items-center justify-between gap-1"
                        onMouseLeave={() => setRatingPreview(null)}
                      >
                        {[1, 2, 3, 4, 5].map((value) => {
                          const activeRating = ratingPreview ?? resource.userRating ?? 0;
                          const selected = resource.userRating === value;
                          const filled = value <= activeRating;
                          return (
                            <button
                              aria-label={`${value} out of 5: ${RATING_LABELS[value]}`}
                              aria-pressed={selected}
                              className={`inline-flex size-10 items-center justify-center rounded-xl border transition-[transform,border-color,background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.96] disabled:cursor-wait disabled:opacity-65 dark:focus-visible:outline-terracotta-400 ${
                                selected
                                  ? "border-terracotta-700 bg-terracotta-100 text-terracotta-800 dark:border-terracotta-400 dark:bg-terracotta-950 dark:text-terracotta-300"
                                  : filled
                                    ? "border-terracotta-300 bg-terracotta-50 text-terracotta-700 hover:border-terracotta-600 dark:border-terracotta-900 dark:bg-terracotta-950/45 dark:text-terracotta-300"
                                    : "border-stone-300 text-stone-400 hover:border-terracotta-500 hover:text-terracotta-700 dark:border-stone-700 dark:text-stone-500 dark:hover:border-terracotta-600 dark:hover:text-terracotta-300"
                              }`}
                              key={value}
                              onClick={() => handleRating(value)}
                              onFocus={() => setRatingPreview(value)}
                              onBlur={() => setRatingPreview(null)}
                              onMouseEnter={() => setRatingPreview(value)}
                              title={RATING_LABELS[value]}
                              type="button"
                            >
                              <Star aria-hidden="true" size={22} weight={filled ? "fill" : "regular"} />
                            </button>
                          );
                        })}
                      </div>
                    </fieldset>

                    <div className="mt-3 text-xs leading-5">
                      {ratingError && (
                        <p className="font-semibold text-red-800 dark:text-red-300" role="alert">
                          {ratingError}
                        </p>
                      )}
                      {!ratingError && ratingNotice && (
                        <p className="flex items-start gap-1.5 font-semibold text-terracotta-800 dark:text-terracotta-300" role="status">
                          <CheckCircle aria-hidden="true" className="mt-0.5 shrink-0" size={15} weight="fill" />
                          {ratingNotice}
                        </p>
                      )}
                      {resource.userRating ? (
                        <div className={`${ratingError || ratingNotice ? "mt-2" : ""} flex items-center justify-between gap-3`}>
                          <p className="font-semibold text-stone-600 dark:text-stone-300">
                            Your rating: {resource.userRating}/5
                          </p>
                          <button
                            className="font-bold text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-red-800 focus-visible:outline-2 focus-visible:outline-red-700 dark:text-stone-400 dark:decoration-stone-700 dark:hover:text-red-300"
                            onClick={handleRemoveRating}
                            type="button"
                          >
                            Remove
                          </button>
                        </div>
                      ) : !ratingError && !ratingNotice ? (
                        <p className="text-stone-500 dark:text-stone-400">
                          Choose the number of stars that best reflects its usefulness.
                        </p>
                      ) : null}
                    </div>
                  </section>

                  <dl className="mt-4 divide-y divide-stone-200 border-t border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                    <FactRow label="Provider" value={resource.provider} />
                    <FactRow label="Category" value={resource.category} />
                    {resource.difficulty !== "Unknown" && <FactRow label="Level" value={resource.difficulty} />}
                    <FactRow label="Provider rating" value={resource.rating == null ? "Not available" : resource.rating.toFixed(1)} />
                  </dl>
                </div>
              </aside>
            </div>
          </main>
        </>
      )}

      <Footer />
    </div>
  );
}
