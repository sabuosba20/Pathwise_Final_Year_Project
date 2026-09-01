import {
  ArrowLeft,
  Books,
  CalendarBlank,
  CaretDown,
  CheckCircle,
  EnvelopeSimple,
  GraduationCap,
  Key,
  Lightbulb,
  Plus,
  SignOut,
  Target,
  Trash,
  UserCircle,
  Warning,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import client from "../api/client";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import { LoadingRegion, Skeleton } from "../components/ui/Skeleton";
import useAuth from "../context/useAuth";
import { FIELD_OPTIONS, getSkillSuggestions, mergeSkills, normaliseSkill, parseSkills } from "../utils/learningProfile";

const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-950 placeholder:text-stone-500 focus:border-terracotta-700 focus:outline-2 focus:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-terracotta-400 dark:focus:outline-terracotta-400";
const TODAY = new Date().toISOString().slice(0, 10);
const EMPTY_LEARNING_FORM = { fieldOfStudy: "", skills: "", learningGoals: "" };

function Feedback({ error, success }) {
  if (!error && !success) return null;

  return (
    <div
      className={`mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
        error
          ? "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "border-terracotta-200 bg-terracotta-50 text-terracotta-900 dark:border-terracotta-900 dark:bg-terracotta-950/50 dark:text-terracotta-200"
      }`}
      role={error ? "alert" : "status"}
    >
      {error ? (
        <WarningCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} weight="bold" />
      ) : (
        <CheckCircle aria-hidden="true" className="mt-0.5 shrink-0" size={18} weight="fill" />
      )}
      {error || success}
    </div>
  );
}

function AccordionSection({ children, danger = false, description, icon, id, open, onToggle, title }) {
  const panelId = `settings-panel-${id}`;

  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white dark:bg-stone-900 ${
        danger
          ? "border-red-200 dark:border-red-950"
          : "border-stone-200 dark:border-stone-800"
      }`}
    >
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="flex min-h-20 w-full items-center gap-4 px-5 py-4 text-left hover:bg-stone-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-terracotta-700 active:bg-stone-100 sm:px-6 dark:hover:bg-stone-800/70 dark:focus-visible:outline-terracotta-400 dark:active:bg-stone-800"
        id={`settings-trigger-${id}`}
        onClick={onToggle}
        type="button"
      >
        <span
          className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${
            danger
              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
              : "bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300"
          }`}
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={`block font-display text-lg font-bold ${
              danger ? "text-red-900 dark:text-red-300" : ""
            }`}
          >
            {title}
          </span>
          <span className="mt-1 block text-sm leading-5 text-stone-600 dark:text-stone-400">
            {description}
          </span>
        </span>
        <CaretDown
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          } ${danger ? "text-red-700 dark:text-red-300" : "text-stone-500"}`}
          size={20}
          weight="bold"
        />
      </button>

      {open && (
        <div
          aria-labelledby={`settings-trigger-${id}`}
          className="border-t border-stone-200 px-5 py-6 dark:border-stone-800 sm:px-6 sm:py-7"
          id={panelId}
          role="region"
        >
          {children}
        </div>
      )}
    </section>
  );
}

export default function Settings() {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const deleteTriggerRef = useRef(null);
  const deleteCloseRef = useRef(null);
  const confirmationInputRef = useRef(null);
  const deleteSubmittingRef = useRef(false);
  const [openSection, setOpenSection] = useState(null);
  const [accountForm, setAccountForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    dateOfBirth: user?.dateOfBirth || "",
    currentPassword: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [learningForm, setLearningForm] = useState(EMPTY_LEARNING_FORM);
  const [skillInput, setSkillInput] = useState("");
  const [deleteForm, setDeleteForm] = useState({ currentPassword: "", confirmation: "" });
  const [accountState, setAccountState] = useState({ submitting: false, error: "", success: "" });
  const [passwordState, setPasswordState] = useState({ submitting: false, error: "", success: "" });
  const [learningState, setLearningState] = useState({
    loading: true,
    submitting: false,
    error: "",
    success: "",
  });
  const [deleteState, setDeleteState] = useState({
    open: false,
    step: "warning",
    submitting: false,
    error: "",
  });

  const learningSkills = useMemo(() => parseSkills(learningForm.skills), [learningForm.skills]);
  const skillSuggestions = useMemo(
    () => getSkillSuggestions(learningForm.fieldOfStudy, learningSkills),
    [learningForm.fieldOfStudy, learningSkills],
  );

  useEffect(() => {
    setAccountForm((current) => ({
      ...current,
      firstName: user?.firstName || "",
      lastName: user?.lastName || "",
      email: user?.email || "",
      dateOfBirth: user?.dateOfBirth || "",
    }));
  }, [user?.dateOfBirth, user?.email, user?.firstName, user?.lastName]);

  useEffect(() => {
    const controller = new AbortController();

    client
      .get("/preferences", { signal: controller.signal })
      .then(({ data }) => {
        setLearningForm(data.preference || EMPTY_LEARNING_FORM);
        setLearningState({ loading: false, submitting: false, error: "", success: "" });
      })
      .catch((requestError) => {
        if (requestError.code !== "ERR_CANCELED") {
          setLearningState({
            loading: false,
            submitting: false,
            error: requestError.response?.data?.message || "Unable to load your learning profile.",
            success: "",
          });
        }
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    deleteSubmittingRef.current = deleteState.submitting;
  }, [deleteState.submitting]);

  useEffect(() => {
    if (!deleteState.open) return undefined;

    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const focusFrame = requestAnimationFrame(() => deleteCloseRef.current?.focus());

    function closeOnEscape(event) {
      if (event.key === "Escape" && !deleteSubmittingRef.current) {
        setDeleteState({ open: false, step: "warning", submitting: false, error: "" });
        setDeleteForm({ currentPassword: "", confirmation: "" });
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [deleteState.open]);

  useEffect(() => {
    if (deleteState.open && deleteState.step === "confirm") {
      confirmationInputRef.current?.focus();
    }
  }, [deleteState.open, deleteState.step]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function closeDeleteDialog() {
    setDeleteForm({ currentPassword: "", confirmation: "" });
    setDeleteState({ open: false, step: "warning", submitting: false, error: "" });
  }

  async function handleAccountSubmit(event) {
    event.preventDefault();
    setAccountState({ submitting: true, error: "", success: "" });
    try {
      const { data } = await client.patch("/auth/account", accountForm);
      setUser(data.user);
      setAccountForm({
        firstName: data.user.firstName,
        lastName: data.user.lastName,
        email: data.user.email,
        dateOfBirth: data.user.dateOfBirth,
        currentPassword: "",
      });
      setAccountState({ submitting: false, error: "", success: data.message });
    } catch (requestError) {
      setAccountState({
        submitting: false,
        error: requestError.response?.data?.message || "Unable to update your account details.",
        success: "",
      });
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordState({ submitting: false, error: "The new passwords do not match.", success: "" });
      return;
    }

    setPasswordState({ submitting: true, error: "", success: "" });
    try {
      const { data } = await client.put("/auth/password", {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setUser(null);
      navigate("/login", { replace: true, state: { message: data.message } });
    } catch (requestError) {
      setPasswordState({
        submitting: false,
        error: requestError.response?.data?.message || "Unable to update your password.",
        success: "",
      });
    }
  }

  async function handleLearningSubmit(event) {
    event.preventDefault();
    const pendingSkill = normaliseSkill(skillInput);
    const skillsToSave = mergeSkills(learningSkills, pendingSkill ? [pendingSkill] : []);
    if (!skillsToSave.length) {
      setLearningState((current) => ({
        ...current,
        error: "Add at least one current skill before saving.",
        success: "",
      }));
      return;
    }

    const payload = { ...learningForm, skills: skillsToSave.join(", ") };
    setLearningForm(payload);
    setSkillInput("");
    setLearningState((current) => ({
      ...current,
      submitting: true,
      error: "",
      success: "",
    }));

    try {
      const { data } = await client.put("/preferences", payload);
      setUser(data.user);
      setLearningState({
        loading: false,
        submitting: false,
        error: "",
        success: data.message,
      });
    } catch (requestError) {
      setLearningState({
        loading: false,
        submitting: false,
        error: requestError.response?.data?.message || "Unable to update your learning profile.",
        success: "",
      });
    }
  }

  function addLearningSkills(values) {
    setLearningForm((current) => ({
      ...current,
      skills: mergeSkills(parseSkills(current.skills), values).join(", "),
    }));
    setSkillInput("");
    setLearningState((current) => ({ ...current, error: "", success: "" }));
  }

  function commitSkillInput() {
    const skill = normaliseSkill(skillInput);
    if (skill) addLearningSkills([skill]);
  }

  function handleSkillKeyDown(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitSkillInput();
      return;
    }

    if (event.key === "Backspace" && !skillInput && learningSkills.length) {
      setLearningForm((current) => ({
        ...current,
        skills: learningSkills.slice(0, -1).join(", "),
      }));
    }
  }

  function removeLearningSkill(skillToRemove) {
    setLearningForm((current) => ({
      ...current,
      skills: parseSkills(current.skills).filter((skill) => skill !== skillToRemove).join(", "),
    }));
    setLearningState((current) => ({ ...current, error: "", success: "" }));
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    setDeleteState((current) => ({ ...current, submitting: true, error: "" }));
    try {
      await client.delete("/auth/account", { data: deleteForm });
      setUser(null);
      navigate("/login", { replace: true });
    } catch (requestError) {
      setDeleteState((current) => ({
        ...current,
        submitting: false,
        error: requestError.response?.data?.message || "Unable to delete your account.",
      }));
    }
  }

  const emailChanged = accountForm.email.trim().toLowerCase() !== (user?.email || "").toLowerCase();
  const accountChanged =
    accountForm.firstName.trim() !== user?.firstName ||
    accountForm.lastName.trim() !== user?.lastName ||
    emailChanged ||
    accountForm.dateOfBirth !== (user?.dateOfBirth || "");
  const canDelete =
    deleteForm.currentPassword.length > 0 && deleteForm.confirmation === "DELETE";

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <DashboardHeader onLogout={handleLogout} userName={user?.name || "Student"} />

      <main>
        <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
          <div className="mx-auto max-w-7xl px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
            <Link
              className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-terracotta-800 hover:text-terracotta-950 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] dark:text-terracotta-300 dark:hover:text-terracotta-200"
              to="/profile"
            >
              <ArrowLeft aria-hidden="true" size={18} weight="bold" />
              Back to profile
            </Link>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">Account settings</h1>
            <p className="mt-3 max-w-2xl leading-7 text-stone-600 dark:text-stone-400">
              Choose a section to manage your account.
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-3 py-7 sm:px-4 sm:py-9 lg:px-6 lg:py-10">
          <div className="space-y-3">
            <AccordionSection
              description="First name, last name, email address and date of birth"
              icon={<UserCircle aria-hidden="true" size={23} weight="bold" />}
              id="personal"
              onToggle={() =>
                setOpenSection((current) => (current === "personal" ? null : "personal"))
              }
              open={openSection === "personal"}
              title="Personal details"
            >
              <form onSubmit={handleAccountSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-bold">First name</span>
                    <input
                      autoComplete="given-name"
                      className={INPUT_CLASS}
                      maxLength={80}
                      onChange={(event) =>
                        setAccountForm({ ...accountForm, firstName: event.target.value })
                      }
                      required
                      type="text"
                      value={accountForm.firstName}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold">Last name</span>
                    <input
                      autoComplete="family-name"
                      className={INPUT_CLASS}
                      maxLength={80}
                      onChange={(event) =>
                        setAccountForm({ ...accountForm, lastName: event.target.value })
                      }
                      required
                      type="text"
                      value={accountForm.lastName}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold">Email address</span>
                    <span className="relative block">
                      <EnvelopeSimple
                        aria-hidden="true"
                        className="pointer-events-none absolute left-4 top-[1.35rem] text-stone-500"
                        size={18}
                      />
                      <input
                        autoComplete="email"
                        className={`${INPUT_CLASS} pl-11`}
                        onChange={(event) =>
                          setAccountForm({ ...accountForm, email: event.target.value })
                        }
                        required
                        type="email"
                        value={accountForm.email}
                      />
                    </span>
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold">Date of birth</span>
                    <span className="relative block">
                      <CalendarBlank
                        aria-hidden="true"
                        className="pointer-events-none absolute left-4 top-[1.35rem] text-stone-500"
                        size={18}
                        weight="bold"
                      />
                      <input
                        autoComplete="bday"
                        className={`${INPUT_CLASS} pl-11`}
                        max={TODAY}
                        onChange={(event) =>
                          setAccountForm({ ...accountForm, dateOfBirth: event.target.value })
                        }
                        type="date"
                        value={accountForm.dateOfBirth}
                      />
                    </span>
                  </label>
                </div>

                {emailChanged && (
                  <label className="mt-5 block max-w-md">
                    <span className="text-sm font-bold">Current password</span>
                    <input
                      autoComplete="current-password"
                      className={INPUT_CLASS}
                      onChange={(event) =>
                        setAccountForm({ ...accountForm, currentPassword: event.target.value })
                      }
                      required
                      type="password"
                      value={accountForm.currentPassword}
                    />
                    <span className="mt-1.5 block text-xs leading-5 text-stone-500 dark:text-stone-400">
                      Required only because you changed your email address.
                    </span>
                  </label>
                )}

                <Feedback error={accountState.error} success={accountState.success} />

                <div className="mt-7 flex justify-end border-t border-stone-200 pt-6 dark:border-stone-800">
                  <button
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300 dark:focus-visible:outline-terracotta-400"
                    disabled={accountState.submitting || !accountChanged}
                    type="submit"
                  >
                    {accountState.submitting ? "Saving..." : "Save personal details"}
                  </button>
                </div>
              </form>
            </AccordionSection>

            <AccordionSection
              description="Degree programme, current skills and what you want to learn"
              icon={<GraduationCap aria-hidden="true" size={23} weight="bold" />}
              id="learning"
              onToggle={() =>
                setOpenSection((current) => (current === "learning" ? null : "learning"))
              }
              open={openSection === "learning"}
              title="Learning profile"
            >
              {learningState.loading ? (
                <LoadingRegion className="space-y-6" label="Loading learning profile">
                  {[
                    { height: "h-12", labelWidth: "w-44" },
                    { height: "h-24", labelWidth: "w-28" },
                    { height: "h-28", labelWidth: "w-32" },
                  ].map((field, index) => (
                    <div key={index}>
                      <Skeleton className={`h-4 ${field.labelWidth} rounded`} />
                      <Skeleton className={`mt-2 ${field.height} w-full rounded-xl`} />
                    </div>
                  ))}
                </LoadingRegion>
              ) : (
                <form onSubmit={handleLearningSubmit}>
                  <div className="grid gap-5">
                    <label className="block">
                      <span className="inline-flex items-center gap-2 text-sm font-bold">
                        <GraduationCap aria-hidden="true" size={18} weight="bold" />
                        Degree programme / field of study
                      </span>
                      <input
                        className={INPUT_CLASS}
                        list="settings-field-options"
                        maxLength={160}
                        onChange={(event) =>
                          setLearningForm({ ...learningForm, fieldOfStudy: event.target.value })
                        }
                        placeholder="Computer Science"
                        required
                        type="text"
                        value={learningForm.fieldOfStudy}
                      />
                      <datalist id="settings-field-options">
                        {FIELD_OPTIONS.map((field) => <option key={field} value={field} />)}
                      </datalist>
                      <span className="mt-1.5 block text-xs leading-5 text-stone-500 dark:text-stone-400">
                        Choose an option or enter your university programme name.
                      </span>
                    </label>

                    <div className="block">
                      <label className="inline-flex items-center gap-2 text-sm font-bold" htmlFor="settings-current-skills">
                        <Books aria-hidden="true" size={18} weight="bold" />
                        Current skills
                      </label>
                      <div className="onboarding-skill-entry mt-2 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 dark:border-stone-700 dark:bg-stone-950">
                        {learningSkills.map((skill) => (
                          <span className="onboarding-skill-tag" key={skill}>
                            {skill}
                            <button aria-label={`Remove ${skill}`} onClick={() => removeLearningSkill(skill)} type="button">
                              <X aria-hidden="true" size={13} weight="bold" />
                            </button>
                          </span>
                        ))}
                        <input
                          aria-describedby="settings-current-skills-help"
                          id="settings-current-skills"
                          maxLength={60}
                          onBlur={commitSkillInput}
                          onChange={(event) => setSkillInput(event.target.value)}
                          onKeyDown={handleSkillKeyDown}
                          placeholder={learningSkills.length ? "Add another skill" : "Type a skill"}
                          required={!learningSkills.length}
                          type="text"
                          value={skillInput}
                        />
                        {skillInput.trim() && (
                          <button className="onboarding-skill-add" onMouseDown={(event) => event.preventDefault()} onClick={commitSkillInput} type="button">
                            <Plus aria-hidden="true" size={15} weight="bold" />
                            Add
                          </button>
                        )}
                      </div>
                      <span className="mt-1.5 block text-xs leading-5 text-stone-500 dark:text-stone-400" id="settings-current-skills-help">
                        Type one skill and press Enter. Backspace removes the last skill.
                      </span>
                      {skillSuggestions.length > 0 && (
                        <div className="onboarding-suggestions" aria-label="Suggested skills">
                          <span><Lightbulb aria-hidden="true" size={14} weight="bold" /> Suggestions</span>
                          {skillSuggestions.map((suggestion) => (
                            <button onClick={() => addLearningSkills([suggestion])} type="button" key={suggestion}>
                              <Plus aria-hidden="true" size={13} weight="bold" />
                              {suggestion}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <label className="block">
                      <span className="inline-flex items-center gap-2 text-sm font-bold">
                        <Target aria-hidden="true" size={18} weight="bold" />
                        Learning goals
                      </span>
                      <textarea
                        className={`${INPUT_CLASS} min-h-28 resize-y`}
                        maxLength={1000}
                        onChange={(event) =>
                          setLearningForm({ ...learningForm, learningGoals: event.target.value })
                        }
                        placeholder="What would you like to learn or achieve next?"
                        value={learningForm.learningGoals}
                      />
                    </label>
                  </div>

                  <Feedback error={learningState.error} success={learningState.success} />

                  <div className="mt-7 flex justify-end border-t border-stone-200 pt-6 dark:border-stone-800">
                    <button
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 sm:w-auto dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300 dark:focus-visible:outline-terracotta-400"
                      disabled={learningState.submitting}
                      type="submit"
                    >
                      {learningState.submitting ? "Saving..." : "Save learning profile"}
                    </button>
                  </div>
                </form>
              )}
            </AccordionSection>

            <AccordionSection
              description="Choose a strong password you do not use elsewhere"
              icon={<Key aria-hidden="true" size={23} weight="bold" />}
              id="password"
              onToggle={() =>
                setOpenSection((current) => (current === "password" ? null : "password"))
              }
              open={openSection === "password"}
              title="Password"
            >
              <form onSubmit={handlePasswordSubmit}>
                <div className="grid gap-5 lg:grid-cols-3">
                  <label className="block">
                    <span className="text-sm font-bold">Current password</span>
                    <input
                      autoComplete="current-password"
                      className={INPUT_CLASS}
                      onChange={(event) =>
                        setPasswordForm({ ...passwordForm, currentPassword: event.target.value })
                      }
                      required
                      type="password"
                      value={passwordForm.currentPassword}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold">New password</span>
                    <input
                      autoComplete="new-password"
                      className={INPUT_CLASS}
                      minLength={12}
                      onChange={(event) =>
                        setPasswordForm({ ...passwordForm, newPassword: event.target.value })
                      }
                      required
                      type="password"
                      value={passwordForm.newPassword}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold">Confirm new password</span>
                    <input
                      autoComplete="new-password"
                      className={INPUT_CLASS}
                      minLength={12}
                      onChange={(event) =>
                        setPasswordForm({ ...passwordForm, confirmPassword: event.target.value })
                      }
                      required
                      type="password"
                      value={passwordForm.confirmPassword}
                    />
                  </label>
                </div>

                <Feedback error={passwordState.error} success={passwordState.success} />

                <div className="mt-7 flex justify-end border-t border-stone-200 pt-6 dark:border-stone-800">
                  <button
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 sm:w-auto dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300 dark:focus-visible:outline-terracotta-400"
                    disabled={passwordState.submitting}
                    type="submit"
                  >
                    {passwordState.submitting ? "Updating..." : "Update password"}
                  </button>
                </div>
              </form>
            </AccordionSection>

            <AccordionSection
              description="Manage the account signed in on this browser"
              icon={<SignOut aria-hidden="true" size={23} weight="bold" />}
              id="session"
              onToggle={() =>
                setOpenSection((current) => (current === "session" ? null : "session"))
              }
              open={openSection === "session"}
              title="Current session"
            >
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 dark:border-stone-800 dark:bg-stone-950">
                <p className="text-sm font-bold">Signed in as</p>
                <p className="mt-1 break-all text-sm text-stone-600 dark:text-stone-400">
                  {user?.email}
                </p>
              </div>

              <div className="mt-7 flex flex-col gap-4 border-t border-stone-200 pt-6 sm:flex-row sm:items-center sm:justify-between dark:border-stone-800">
                <p className="text-sm leading-6 text-stone-600 dark:text-stone-400">
                  You will return to the login page and can sign in again at any time.
                </p>
                <button
                  className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-300 px-5 text-sm font-bold text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-700 active:scale-[0.98] sm:w-auto dark:border-stone-700 dark:text-stone-100 dark:hover:bg-stone-800 dark:focus-visible:outline-stone-300"
                  onClick={handleLogout}
                  type="button"
                >
                  <SignOut aria-hidden="true" size={18} weight="bold" />
                  Log out
                </button>
              </div>
            </AccordionSection>

            <AccordionSection
              danger
              description="Permanently remove your account and learning data"
              icon={<Trash aria-hidden="true" size={23} weight="bold" />}
              id="delete"
              onToggle={() =>
                setOpenSection((current) => (current === "delete" ? null : "delete"))
              }
              open={openSection === "delete"}
              title="Delete account"
            >
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-950 dark:border-red-950 dark:bg-red-950/30 dark:text-red-200">
                <div className="flex gap-3">
                  <Warning aria-hidden="true" className="mt-0.5 shrink-0" size={22} weight="fill" />
                  <div>
                    <p className="font-bold">Account deletion is permanent</p>
                    <p className="mt-1 text-sm leading-6 text-red-800 dark:text-red-300">
                      Your profile, preferences, saved courses, and learning activity cannot be recovered.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-7 flex justify-end border-t border-red-200 pt-6 dark:border-red-950">
                <button
                  className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-5 text-sm font-bold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-red-700 active:scale-[0.98] sm:w-auto dark:bg-red-300 dark:text-red-950 dark:hover:bg-red-200"
                  onClick={() =>
                    setDeleteState({ open: true, step: "warning", submitting: false, error: "" })
                  }
                  ref={deleteTriggerRef}
                  type="button"
                >
                  <Trash aria-hidden="true" size={18} weight="bold" />
                  Delete my account
                </button>
              </div>
            </AccordionSection>
          </div>
        </div>
      </main>

      {deleteState.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !deleteState.submitting) closeDeleteDialog();
          }}
        >
          <section
            aria-labelledby="delete-dialog-title"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl border border-stone-200 bg-white p-6 shadow-[0_24px_80px_rgb(0_0_0/0.35)] dark:border-stone-700 dark:bg-stone-900 sm:p-7"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                <Warning aria-hidden="true" size={25} weight="fill" />
              </span>
              <button
                aria-label="Close account deletion dialog"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-stone-500 hover:bg-stone-100 hover:text-stone-950 focus-visible:outline-2 focus-visible:outline-red-700 active:scale-[0.96] dark:hover:bg-stone-800 dark:hover:text-stone-100"
                disabled={deleteState.submitting}
                onClick={closeDeleteDialog}
                ref={deleteCloseRef}
                type="button"
              >
                <X aria-hidden="true" size={20} weight="bold" />
              </button>
            </div>

            {deleteState.step === "warning" ? (
              <>
                <h2 className="mt-5 font-display text-2xl font-bold" id="delete-dialog-title">
                  Are you sure you want to delete your account?
                </h2>
                <p className="mt-3 leading-7 text-stone-600 dark:text-stone-400">
                  This will permanently remove your account and all associated Pathwise data.
                </p>
                <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 px-5 text-sm font-bold text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-700 active:scale-[0.98] dark:border-stone-700 dark:text-stone-100 dark:hover:bg-stone-800"
                    onClick={closeDeleteDialog}
                    type="button"
                  >
                    Keep my account
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-red-800 px-5 text-sm font-bold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-red-700 active:scale-[0.98] dark:bg-red-300 dark:text-red-950 dark:hover:bg-red-200"
                    onClick={() =>
                      setDeleteState((current) => ({ ...current, step: "confirm", error: "" }))
                    }
                    type="button"
                  >
                    Yes, continue
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleDeleteAccount}>
                <h2 className="mt-5 font-display text-2xl font-bold" id="delete-dialog-title">
                  Confirm permanent deletion
                </h2>
                <p className="mt-3 leading-7 text-stone-600 dark:text-stone-400">
                  Enter your password and type <strong className="text-stone-950 dark:text-stone-100">DELETE</strong> below.
                </p>

                <div className="mt-6 space-y-5">
                  <label className="block">
                    <span className="text-sm font-bold">Type DELETE</span>
                    <input
                      autoComplete="off"
                      className={INPUT_CLASS}
                      onChange={(event) =>
                        setDeleteForm({ ...deleteForm, confirmation: event.target.value })
                      }
                      placeholder="DELETE"
                      ref={confirmationInputRef}
                      required
                      type="text"
                      value={deleteForm.confirmation}
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-bold">Current password</span>
                    <input
                      autoComplete="current-password"
                      className={INPUT_CLASS}
                      onChange={(event) =>
                        setDeleteForm({ ...deleteForm, currentPassword: event.target.value })
                      }
                      required
                      type="password"
                      value={deleteForm.currentPassword}
                    />
                  </label>
                </div>

                <Feedback error={deleteState.error} />

                <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-stone-300 px-5 text-sm font-bold text-stone-800 hover:bg-stone-100 focus-visible:outline-2 focus-visible:outline-stone-700 active:scale-[0.98] disabled:opacity-50 dark:border-stone-700 dark:text-stone-100 dark:hover:bg-stone-800"
                    disabled={deleteState.submitting}
                    onClick={() =>
                      setDeleteState((current) => ({ ...current, step: "warning", error: "" }))
                    }
                    type="button"
                  >
                    Back
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-800 px-5 text-sm font-bold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-red-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-300 dark:text-red-950 dark:hover:bg-red-200"
                    disabled={!canDelete || deleteState.submitting}
                    type="submit"
                  >
                    <Trash aria-hidden="true" size={18} weight="bold" />
                    {deleteState.submitting ? "Deleting..." : "Delete permanently"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
