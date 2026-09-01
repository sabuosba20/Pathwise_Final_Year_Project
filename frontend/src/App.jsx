import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

import ProtectedRoute from "./components/ProtectedRoute";
import { LoadingRegion, Skeleton } from "./components/ui/Skeleton";
import Landing from "./pages/Landing";

const Activity = lazy(() => import("./pages/Activity"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Catalogue = lazy(() => import("./pages/Catalogue"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const Goals = lazy(() => import("./pages/Goals"));
const Login = lazy(() => import("./pages/Login"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const Profile = lazy(() => import("./pages/Profile"));
const Register = lazy(() => import("./pages/Register"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const ResourceDetail = lazy(() => import("./pages/ResourceDetail"));
const Settings = lazy(() => import("./pages/Settings"));
const Terms = lazy(() => import("./pages/Terms"));

function RouteFallback() {
  return (
    <div className="min-h-[100dvh] bg-stone-50 dark:bg-stone-950">
      <LoadingRegion label="Loading page">
        <header className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="flex h-[4.5rem] items-center justify-between px-12 sm:px-20 lg:px-28">
            <Skeleton className="h-9 w-36 rounded-xl" />
            <div className="hidden items-center gap-3 sm:flex">
              <Skeleton className="h-9 w-20 rounded-xl" />
              <Skeleton className="h-9 w-9 rounded-full" />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-3 py-10 sm:px-4 lg:px-6">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="mt-4 h-10 w-72 max-w-full rounded-lg" />
          <Skeleton className="mt-3 h-4 w-[30rem] max-w-full rounded" />
          <div className="mt-9 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <Skeleton className="h-64 rounded-2xl" key={index} />
            ))}
          </div>
        </main>
      </LoadingRegion>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute mode="guest" />}>
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Route>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route element={<ProtectedRoute mode="onboarding" />}>
          <Route path="/onboarding" element={<Onboarding />} />
        </Route>
        <Route element={<ProtectedRoute mode="complete" />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/goals" element={<Goals />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/resources/:id" element={<ResourceDetail />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
