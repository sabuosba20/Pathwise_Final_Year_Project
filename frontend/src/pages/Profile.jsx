import {
  ArrowRight,
  BookmarkSimple,
  Books,
  CalendarBlank,
  Check,
  CheckCircle,
  EnvelopeSimple,
  GraduationCap,
  Target,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import client from "../api/client";
import Avatar from "../components/Avatar";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import Footer from "../components/Footer";
import SavedCoursesTab from "../components/dashboard/SavedCoursesTab";
import { LoadingRegion, Skeleton } from "../components/ui/Skeleton";
import useAuth from "../context/useAuth";

const EMPTY_FORM = { fieldOfStudy: "", skills: "", learningGoals: "" };

function splitList(value) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatMemberSince(isoDate) {
  if (!isoDate) return null;
  return new Date(isoDate).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function ProfileHeaderSkeleton() {
  return (
    <LoadingRegion label="Loading your profile">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <Skeleton className="size-24 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-9 w-56 max-w-full rounded" />
          <Skeleton className="mt-3 h-4 w-64 max-w-full rounded" />
          <Skeleton className="mt-6 h-5 w-80 max-w-full rounded" />
        </div>
      </div>
    </LoadingRegion>
  );
}

function getProfileTab(searchParams) {
  return searchParams.get("tab") === "saved" ? "saved" : "profile";
}

export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => getProfileTab(searchParams));
  const [savedForm, setSavedForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [savedCount, setSavedCount] = useState(null);
  const [completedCourseCount, setCompletedCourseCount] = useState(null);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  useEffect(() => {
    setActiveTab(getProfileTab(searchParams));
  }, [searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    Promise.all([
      client.get("/preferences", { signal: controller.signal }),
      client.get("/resources", { params: { bookmarked: true, per_page: 1 }, signal: controller.signal }),
      client.get("/resources", { params: { completed: true, per_page: 1 }, signal: controller.signal }),
    ])
      .then(([preferencesResponse, resourcesResponse, completedResponse]) => {
        const { preference } = preferencesResponse.data;
        const nextForm = preference
          ? {
              fieldOfStudy: preference.fieldOfStudy,
              skills: preference.skills,
              learningGoals: preference.learningGoals,
            }
          : EMPTY_FORM;
        setSavedForm(nextForm);
        setSavedCount(resourcesResponse.data.pagination.total);
        setCompletedCourseCount(completedResponse.data.pagination.total);
      })
      .catch((requestError) => {
        if (requestError.code !== "ERR_CANCELED") {
          setError("Your profile could not be loaded. Please try again.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [requestVersion]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function handleTabChange(nextTab) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextTab === "profile") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", nextTab);
    }
    setSearchParams(nextParams, { replace: true });
  }

  const skills = splitList(savedForm.skills);
  const memberSince = formatMemberSince(user?.memberSince);
  const completionItems = [
    { label: "Degree programme", complete: Boolean(savedForm.fieldOfStudy) },
    { label: "Current skills", complete: skills.length > 0 },
    { label: "Learning goal", complete: Boolean(savedForm.learningGoals) },
  ];
  const completedItems = completionItems.filter((item) => item.complete).length;
  const completionPercentage = Math.round((completedItems / completionItems.length) * 100);

  const tabs = [
    { icon: UserCircle, key: "profile", label: "Profile" },
    { count: savedCount, icon: BookmarkSimple, key: "saved", label: "Saved courses" },
  ];

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <DashboardHeader onLogout={handleLogout} userName={user?.name || "Student"} />

      <main>
        <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto max-w-7xl px-3 py-9 sm:px-4 sm:py-11 lg:px-6 lg:py-14">
            {loading ? (
              <ProfileHeaderSkeleton />
            ) : (
              <div className="flex flex-col gap-7 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
                  <span className="w-fit rounded-full ring-4 ring-terracotta-100 dark:ring-terracotta-950">
                    <Avatar name={user?.name} size="xl" />
                  </span>
                  <div className="min-w-0">
                    <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                      {user?.name || "Student"}
                    </h1>
                    <p className="mt-2 truncate text-stone-600 dark:text-stone-400">{user?.email}</p>
                    <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium text-stone-600 dark:text-stone-400">
                      {savedForm.fieldOfStudy && (
                        <span className="inline-flex items-center gap-2">
                          <GraduationCap aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={19} weight="bold" />
                          {savedForm.fieldOfStudy}
                        </span>
                      )}
                      {memberSince && (
                        <span className="inline-flex items-center gap-2">
                          <CalendarBlank aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={18} weight="bold" />
                          Member since {memberSince}
                        </span>
                      )}
                      {savedCount !== null && (
                        <span className="inline-flex items-center gap-2">
                          <BookmarkSimple aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={18} weight="fill" />
                          {savedCount} saved course{savedCount === 1 ? "" : "s"}
                        </span>
                      )}
                      {completedCourseCount !== null && (
                        <span className="inline-flex items-center gap-2">
                          <CheckCircle aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={18} weight="fill" />
                          {completedCourseCount} completed course{completedCourseCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

              </div>
            )}

            <nav
              aria-label="Profile views"
              className="mt-8 grid w-full grid-cols-2 rounded-xl border border-stone-300 bg-white p-1 sm:inline-grid sm:w-auto dark:border-stone-700 dark:bg-stone-900"
            >
              {tabs.map(({ key, label, icon: Icon, count }) => (
                <button
                  aria-current={activeTab === key ? "page" : undefined}
                  className={`inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg px-3.5 text-center text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:focus-visible:outline-terracotta-400 ${activeTab === key ? "bg-terracotta-800 text-white dark:bg-terracotta-400 dark:text-stone-950" : "text-stone-600 hover:text-terracotta-800 dark:text-stone-400 dark:hover:text-terracotta-300"}`}
                  key={key}
                  onClick={() => handleTabChange(key)}
                  type="button"
                >
                  <Icon aria-hidden="true" size={18} weight={activeTab === key ? "fill" : "bold"} />
                  {label}
                  {count != null && (
                    <span className={`rounded-md px-1.5 py-0.5 text-[0.68rem] ${activeTab === key ? "bg-white/20 text-current dark:bg-stone-950/20" : "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"}`}>
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-3 py-7 sm:px-4 sm:py-9 lg:px-6 lg:py-11">
          {error && !loading && (
            <div className="mb-6 rounded-xl border border-red-300 bg-red-50 p-5 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
              <WarningCircle aria-hidden="true" size={26} weight="bold" />
              <p className="mt-3 text-sm font-semibold">{error}</p>
              <button
                className="mt-4 min-h-10 rounded-xl bg-red-900 px-4 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-red-800 active:translate-y-px dark:bg-red-200 dark:text-red-950"
                onClick={() => setRequestVersion((version) => version + 1)}
                type="button"
              >
                Try again
              </button>
            </div>
          )}

          {activeTab === "saved" ? (
            <SavedCoursesTab onSavedCountChange={setSavedCount} />
          ) : (
          <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
            <section className="min-w-0 overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
              {loading ? (
                <LoadingRegion className="p-6 sm:p-8" label="Loading learning profile">
                  <Skeleton className="h-7 w-48 rounded" />
                  <div className="mt-8 space-y-8">
                    <div>
                      <Skeleton className="h-4 w-32 rounded" />
                      <Skeleton className="mt-4 h-7 w-60 max-w-full rounded" />
                    </div>
                    <div>
                      <Skeleton className="h-4 w-28 rounded" />
                      <div className="mt-4 flex gap-2">
                        <Skeleton className="h-8 w-24 rounded-lg" />
                        <Skeleton className="h-8 w-32 rounded-lg" />
                        <Skeleton className="h-8 w-20 rounded-lg" />
                      </div>
                    </div>
                    <div>
                      <Skeleton className="h-4 w-28 rounded" />
                      <Skeleton className="mt-4 h-4 w-full rounded" />
                      <Skeleton className="mt-3 h-4 w-3/4 rounded" />
                    </div>
                  </div>
                </LoadingRegion>
              ) : error ? (
                <div className="flex flex-col items-center gap-2 px-6 py-16 text-center sm:px-8">
                  <WarningCircle aria-hidden="true" className="text-stone-400 dark:text-stone-600" size={26} weight="bold" />
                  <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">
                    Your learning profile could not be loaded.
                  </p>
                </div>
              ) : (
                <>
                  <div className="border-b border-stone-200 px-6 py-6 dark:border-stone-800 sm:px-8">
                    <h2 className="font-display text-2xl font-bold tracking-tight">Learning profile</h2>
                  </div>

                  <div className="divide-y divide-stone-200 dark:divide-stone-800">
                    <div className="grid gap-3 px-6 py-6 sm:grid-cols-[13rem_minmax(0,1fr)] sm:px-8 sm:py-7">
                      <h3 className="flex items-center gap-3 text-sm font-bold text-stone-500 dark:text-stone-400">
                        <GraduationCap aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={21} weight="bold" />
                        Degree programme
                      </h3>
                      <p className="font-display text-lg font-bold">
                        {savedForm.fieldOfStudy || "Not added yet"}
                      </p>
                    </div>

                    <div className="grid gap-4 px-6 py-6 sm:grid-cols-[13rem_minmax(0,1fr)] sm:px-8 sm:py-7">
                      <h3 className="flex items-center gap-3 self-start text-sm font-bold text-stone-500 dark:text-stone-400">
                        <Books aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={21} weight="bold" />
                        Current skills
                      </h3>
                      {skills.length ? (
                        <div className="flex flex-wrap gap-2">
                          {skills.map((skill) => (
                            <span
                              className="inline-flex min-h-8 items-center rounded-lg border border-stone-200 bg-stone-50 px-3 text-sm font-semibold text-stone-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-300"
                              key={skill}
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-stone-600 dark:text-stone-400">No skills added yet.</p>
                      )}
                    </div>

                    <div className="grid gap-3 px-6 py-6 sm:grid-cols-[13rem_minmax(0,1fr)] sm:px-8 sm:py-7">
                      <h3 className="flex items-center gap-3 self-start text-sm font-bold text-stone-500 dark:text-stone-400">
                        <Target aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={21} weight="bold" />
                        Learning goal
                      </h3>
                      <p className="max-w-2xl text-base leading-7 text-stone-800 dark:text-stone-200">
                        {savedForm.learningGoals || "Add a learning goal to guide your recommendations."}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </section>

            <aside>
              <section className="overflow-hidden rounded-xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900 lg:sticky lg:top-6">
                <div className="p-6">
                  {loading ? (
                    <LoadingRegion label="Loading profile completeness">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <Skeleton className="h-5 w-36 rounded" />
                          <Skeleton className="mt-3 h-3 w-44 rounded" />
                        </div>
                        <Skeleton className="h-8 w-12 rounded-lg" />
                      </div>
                      <div className="mt-5 space-y-3">
                        {Array.from({ length: 3 }, (_, index) => (
                          <div className="flex items-center gap-2.5" key={index}>
                            <Skeleton className="size-6 rounded-lg" />
                            <Skeleton className="h-3 w-28 rounded" />
                          </div>
                        ))}
                      </div>
                    </LoadingRegion>
                  ) : error ? (
                    <p className="text-sm text-stone-500 dark:text-stone-400">
                      Profile completeness is unavailable right now.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="font-display text-lg font-bold">Profile overview</h2>
                          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                            {completedItems} of {completionItems.length} details complete
                          </p>
                        </div>
                        <p className="font-display text-2xl font-bold text-terracotta-800 dark:text-terracotta-300">
                          {completionPercentage}%
                        </p>
                      </div>
                    <div className="mt-5 space-y-3">
                      {completionItems.map((item) => (
                        <div className="flex items-center gap-2.5 text-sm" key={item.label}>
                          <span
                            className={`inline-flex size-6 items-center justify-center rounded-lg ${
                              item.complete
                                ? "bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300"
                                : "bg-stone-100 text-stone-400 dark:bg-stone-800 dark:text-stone-500"
                            }`}
                          >
                            {item.complete ? <Check aria-hidden="true" size={14} weight="bold" /> : null}
                          </span>
                          <span className={item.complete ? "text-stone-800 dark:text-stone-200" : "text-stone-500 dark:text-stone-400"}>
                            {item.label}
                          </span>
                        </div>
                      ))}
                    </div>
                    </>
                  )}
                </div>

                <div className="border-t border-stone-200 p-6 dark:border-stone-800">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-base font-bold">Completed courses</h2>
                      {loading ? (
                        <Skeleton className="mt-2 h-3 w-24 rounded" />
                      ) : completedCourseCount === null ? (
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">Unavailable</p>
                      ) : (
                        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                          {completedCourseCount} course{completedCourseCount === 1 ? "" : "s"}
                        </p>
                      )}
                    </div>
                    <CheckCircle aria-hidden="true" className="text-terracotta-700 dark:text-terracotta-300" size={23} weight="fill" />
                  </div>
                  <Link
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-terracotta-300 dark:hover:text-terracotta-200"
                    to="/activity?type=completed"
                  >
                    View completed courses
                    <ArrowRight aria-hidden="true" size={17} weight="bold" />
                  </Link>
                </div>

                <div className="border-t border-stone-200 p-6 dark:border-stone-800">
                  <h2 className="font-display text-base font-bold">Account details</h2>
                  <div className="mt-4 flex items-start gap-3 text-sm">
                    <EnvelopeSimple aria-hidden="true" className="mt-0.5 shrink-0 text-terracotta-700 dark:text-terracotta-300" size={18} weight="bold" />
                    <div className="min-w-0">
                      <p className="font-semibold text-stone-800 dark:text-stone-200">Email address</p>
                      <p className="mt-1 truncate text-stone-500 dark:text-stone-400">{user?.email}</p>
                    </div>
                  </div>
                  <Link
                    className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-terracotta-300 dark:hover:text-terracotta-200"
                    to="/activity"
                  >
                    <Books aria-hidden="true" size={18} weight="bold" />
                    View learning activity
                  </Link>
                </div>
              </section>
            </aside>
          </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
