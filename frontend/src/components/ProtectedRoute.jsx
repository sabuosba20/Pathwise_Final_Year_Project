import { Navigate, Outlet, useLocation } from "react-router";

import useAuth from "../context/useAuth";
import { LoadingRegion, Skeleton } from "./ui/Skeleton";

export default function ProtectedRoute({ mode = "complete" }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-stone-50 px-6 dark:bg-stone-950">
        <LoadingRegion className="w-full max-w-sm" label="Checking your account">
          <div className="flex flex-col items-center">
            <Skeleton className="size-12 rounded-2xl" />
            <Skeleton className="mt-5 h-6 w-40 rounded-lg" />
            <Skeleton className="mt-3 h-3 w-56 rounded" />
          </div>
        </LoadingRegion>
      </main>
    );
  }

  if (mode === "guest") {
    if (!user) return <Outlet />;
    return (
      <Navigate
        replace
        to={user.onboardingComplete ? "/dashboard" : "/onboarding"}
      />
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (mode === "onboarding" && user.onboardingComplete) {
    return <Navigate to="/dashboard" replace />;
  }
  if (mode === "complete" && !user.onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }
  return <Outlet />;
}
