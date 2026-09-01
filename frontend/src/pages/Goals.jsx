import {
  ArrowRight,
  ArrowSquareOut,
  CheckCircle,
  Flag,
  Lightbulb,
  PencilSimple,
  PlusCircle,
  SpinnerGap,
  Target,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router";

import client from "../api/client";
import DashboardHeader from "../components/dashboard/DashboardHeader";
import { LoadingRegion, Skeleton } from "../components/ui/Skeleton";
import useAuth from "../context/useAuth";

const INPUT_CLASS =
  "mt-2 w-full rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 text-stone-950 placeholder:text-stone-500 focus:border-terracotta-700 focus:outline-2 focus:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-terracotta-400 dark:focus:outline-terracotta-400";
const TODAY = new Date().toISOString().slice(0, 10);
const EMPTY_FORM = { title: "", targetDate: "" };
const MAX_TAG_SUGGESTIONS = 8;

function normaliseTag(tag) {
  return tag.trim().replace(/\s+/g, " ");
}

function mergeTags(current, incoming) {
  const merged = [...current];
  incoming.forEach((value) => {
    const tag = normaliseTag(value);
    if (tag && !merged.some((item) => item.toLowerCase() === tag.toLowerCase())) merged.push(tag);
  });
  return merged.slice(0, 20);
}

function TagChipInput({
  inputId,
  onAddSuggestion,
  onBlur,
  onKeyDown,
  onRemoveTag,
  onTagInputChange,
  placeholder,
  suggestions,
  tagInput,
  tags,
}) {
  return (
    <>
      <div className="mt-2 flex w-full flex-wrap items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 focus-within:border-terracotta-700 focus-within:outline-2 focus-within:outline-terracotta-700 dark:border-stone-700 dark:bg-stone-950 dark:focus-within:border-terracotta-400 dark:focus-within:outline-terracotta-400">
        {tags.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-terracotta-100 py-1 pl-2.5 pr-1.5 text-xs font-semibold text-terracotta-900 dark:bg-terracotta-950 dark:text-terracotta-200"
            key={tag}
          >
            {tag}
            <button
              aria-label={`Remove ${tag}`}
              className="rounded-full p-0.5 hover:bg-terracotta-200 dark:hover:bg-terracotta-900"
              onClick={() => onRemoveTag(tag)}
              type="button"
            >
              <X aria-hidden="true" size={12} weight="bold" />
            </button>
          </span>
        ))}
        <input
          aria-describedby={`${inputId}-help`}
          className="min-w-32 flex-1 bg-transparent outline-none"
          id={inputId}
          onBlur={onBlur}
          onChange={(event) => onTagInputChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          type="text"
          value={tagInput}
        />
      </div>
      {suggestions.length > 0 && (
        <div aria-label="Matching catalogue tags" className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 dark:text-stone-400">
            <Lightbulb aria-hidden="true" size={14} weight="bold" />
            Matches
          </span>
          {suggestions.map((suggestion) => (
            <button
              className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:border-terracotta-700 hover:text-terracotta-800 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
              key={suggestion}
              onClick={() => onAddSuggestion(suggestion)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              <PlusCircle aria-hidden="true" size={13} weight="bold" />
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const TABS = [
  { key: "all", label: "All goals" },
  { key: "active", label: "Active" },
  { key: "completed", label: "Completed" },
  { key: "abandoned", label: "Abandoned" },
];

const STATUS_BADGE = {
  active: "bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  abandoned: "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

function formatTargetDate(isoDate) {
  if (!isoDate) return "";
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function GoalCard({ goal, onDelete, onStatusChange, onUpdate, tagOptions, deletePending, deleteConfirming, statusPending }) {
  const { progress } = goal;
  const isOverdue = goal.status === "active" && goal.targetDate && goal.targetDate < TODAY;

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(goal.title);
  const [editTags, setEditTags] = useState(goal.targetTags);
  const [editTagInput, setEditTagInput] = useState("");
  const [editTargetDate, setEditTargetDate] = useState(goal.targetDate || "");
  const [editError, setEditError] = useState("");
  const [editSubmitting, setEditSubmitting] = useState(false);

  const editTagSuggestions = useMemo(() => {
    const input = editTagInput.trim().toLowerCase();
    if (!input) return [];
    return tagOptions
      .filter((option) => option.toLowerCase().includes(input))
      .filter((option) => !editTags.some((tag) => tag.toLowerCase() === option.toLowerCase()))
      .slice(0, MAX_TAG_SUGGESTIONS);
  }, [editTagInput, tagOptions, editTags]);

  function startEditing() {
    setEditTitle(goal.title);
    setEditTags(goal.targetTags);
    setEditTagInput("");
    setEditTargetDate(goal.targetDate || "");
    setEditError("");
    setEditing(true);
  }

  function addEditTags(values) {
    setEditTags((current) => mergeTags(current, values));
    setEditTagInput("");
  }

  function commitEditTagInput() {
    const values = editTagInput.split(/[,;\n]+/);
    if (values.some((value) => normaliseTag(value))) addEditTags(values);
  }

  function handleEditTagKeyDown(event) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitEditTagInput();
      return;
    }

    if (event.key === "Backspace" && !editTagInput && editTags.length) {
      setEditTags((current) => current.slice(0, -1));
    }
  }

  async function handleSaveEdit() {
    setEditError("");
    const pendingTag = normaliseTag(editTagInput);
    const tagsToSave = mergeTags(editTags, pendingTag ? [pendingTag] : []);
    if (!editTitle.trim() || !tagsToSave.length) {
      setEditError("Add a goal title and at least one skill or topic.");
      return;
    }

    setEditSubmitting(true);
    try {
      await onUpdate(goal.id, {
        title: editTitle.trim(),
        targetTags: tagsToSave.join(", "),
        targetDate: editTargetDate || "",
      });
      setEditing(false);
    } catch (requestError) {
      setEditError(requestError.response?.data?.message || "That goal could not be saved. Please try again.");
    } finally {
      setEditSubmitting(false);
    }
  }

  if (editing) {
    return (
      <article className="rounded-2xl border border-terracotta-300 bg-white p-5 dark:border-terracotta-700 dark:bg-stone-900">
        <div className="grid gap-4">
          <label>
            <span className="text-sm font-bold text-stone-800 dark:text-stone-200">Goal title</span>
            <input
              className={INPUT_CLASS}
              onChange={(event) => setEditTitle(event.target.value)}
              type="text"
              value={editTitle}
            />
          </label>

          <div>
            <span className="text-sm font-bold text-stone-800 dark:text-stone-200">Skills or topics</span>
            <TagChipInput
              inputId={`edit-goal-tags-${goal.id}`}
              onAddSuggestion={(suggestion) => addEditTags([suggestion])}
              onBlur={commitEditTagInput}
              onKeyDown={handleEditTagKeyDown}
              onRemoveTag={(tag) => setEditTags((current) => current.filter((item) => item !== tag))}
              onTagInputChange={setEditTagInput}
              placeholder={editTags.length ? "Add another" : "Type a skill or topic"}
              suggestions={editTagSuggestions}
              tagInput={editTagInput}
              tags={editTags}
            />
          </div>

          <label>
            <span className="text-sm font-bold text-stone-800 dark:text-stone-200">Target date</span>
            <input
              className={INPUT_CLASS}
              onChange={(event) => setEditTargetDate(event.target.value)}
              type="date"
              value={editTargetDate}
            />
          </label>

          {editError && (
            <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
              {editError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-terracotta-800 px-4 text-sm font-bold text-white transition-colors hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300"
              disabled={editSubmitting}
              onClick={handleSaveEdit}
              type="button"
            >
              {editSubmitting && <SpinnerGap aria-hidden="true" className="motion-safe:animate-spin" size={16} weight="bold" />}
              Save changes
            </button>
            <button
              className="inline-flex min-h-10 items-center rounded-xl border border-stone-300 px-4 text-sm font-bold text-stone-700 transition-colors hover:border-stone-500 dark:border-stone-700 dark:text-stone-300"
              disabled={editSubmitting}
              onClick={() => setEditing(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold leading-snug text-stone-950 dark:text-stone-100">
              {goal.title}
            </h3>
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold capitalize ${STATUS_BADGE[goal.status]}`}>
              {goal.status}
            </span>
          </div>
          {goal.targetTags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {goal.targetTags.map((tag) => (
                <span
                  className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700 dark:bg-stone-800 dark:text-stone-300"
                  key={tag}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {goal.targetDate && (
            <p className={`mt-2 text-sm font-semibold ${isOverdue ? "text-red-700 dark:text-red-400" : "text-stone-500 dark:text-stone-400"}`}>
              {isOverdue ? "Overdue since " : "Target: "}
              {formatTargetDate(goal.targetDate)}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label={`Edit ${goal.title}`}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-stone-300 px-3 text-xs font-bold text-stone-600 transition-colors hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:border-stone-700 dark:text-stone-400 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
            onClick={startEditing}
            type="button"
          >
            <PencilSimple aria-hidden="true" size={16} weight="bold" />
            Edit
          </button>

          <button
            aria-label={deleteConfirming ? `Confirm delete for ${goal.title}` : `Delete ${goal.title}`}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 dark:focus-visible:outline-terracotta-400 ${
              deleteConfirming
                ? "border-red-700 bg-red-700 text-white hover:bg-red-800 dark:border-red-500 dark:bg-red-600"
                : "border-stone-300 text-stone-600 hover:border-red-700 hover:text-red-800 dark:border-stone-700 dark:text-stone-400 dark:hover:border-red-400 dark:hover:text-red-300"
            }`}
            disabled={deletePending}
            onClick={() => onDelete(goal.id)}
            type="button"
          >
            {deletePending ? (
              <SpinnerGap aria-hidden="true" className="motion-safe:animate-spin" size={16} weight="bold" />
            ) : (
              <Trash aria-hidden="true" size={16} weight="bold" />
            )}
            {deleteConfirming ? "Confirm delete" : "Delete"}
          </button>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-sm">
          <p className="font-semibold text-stone-700 dark:text-stone-300">
            {progress.totalMatched > 0
              ? `${progress.completedCount} of ${progress.totalMatched} matched courses completed`
              : "Add tags that match courses in the catalogue to track progress."}
          </p>
          <p className="font-bold text-terracotta-800 dark:text-terracotta-300">{progress.percent}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
          <div
            className="h-full rounded-full bg-terracotta-700 transition-[width] dark:bg-terracotta-400"
            style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
          />
        </div>
      </div>

      {progress.suggestedCourses.length > 0 && (
        <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-800">
          <p className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">
            Suggested courses
          </p>
          <div className="mt-2 space-y-1">
            {progress.suggestedCourses.map((course) => (
              <Link
                className="group flex items-center justify-between gap-3 rounded-lg py-1 text-sm font-semibold text-stone-800 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:text-stone-200 dark:hover:text-terracotta-300"
                key={course.id}
                to={`/resources/${course.id}`}
              >
                <span className="min-w-0 truncate">
                  {course.title}
                  <span className="font-normal text-stone-500 dark:text-stone-400"> · {course.provider}</span>
                </span>
                <ArrowSquareOut aria-hidden="true" className="shrink-0 text-stone-400 group-hover:text-terracotta-800 dark:group-hover:text-terracotta-300" size={16} weight="bold" />
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {goal.status !== "active" && (
          <button
            className="inline-flex min-h-9 items-center rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-700 transition-colors hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
            disabled={statusPending}
            onClick={() => onStatusChange(goal.id, "active")}
            type="button"
          >
            Reactivate
          </button>
        )}
        {goal.status !== "completed" && (
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-700 transition-colors hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
            disabled={statusPending}
            onClick={() => onStatusChange(goal.id, "completed")}
            type="button"
          >
            <CheckCircle aria-hidden="true" size={15} weight="bold" />
            Mark complete
          </button>
        )}
        {goal.status === "active" && (
          <button
            className="inline-flex min-h-9 items-center rounded-lg border border-stone-300 px-3 text-xs font-bold text-stone-600 transition-colors hover:border-stone-500 hover:text-stone-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 dark:border-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            disabled={statusPending}
            onClick={() => onStatusChange(goal.id, "abandoned")}
            type="button"
          >
            Abandon
          </button>
        )}
      </div>
    </article>
  );
}

export default function Goals() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [goals, setGoals] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [requestVersion, setRequestVersion] = useState(0);

  const [form, setForm] = useState(EMPTY_FORM);
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const [tagOptions, setTagOptions] = useState([]);
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [statusPendingIds, setStatusPendingIds] = useState(new Set());
  const [deletePendingIds, setDeletePendingIds] = useState(new Set());
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [goalCounts, setGoalCounts] = useState({ active: null, completed: null, abandoned: null });
  const [addGoalOpen, setAddGoalOpen] = useState(false);
  const [addGoalVisible, setAddGoalVisible] = useState(false);

  const loadGoals = useCallback(async (signal) => {
    setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/goals", {
        params: statusFilter === "all" ? undefined : { status: statusFilter },
        signal,
      });
      setGoals(data.goals);
    } catch (requestError) {
      if (requestError.code !== "ERR_CANCELED") {
        setError(requestError.response?.data?.message || "Your goals could not be loaded. Please try again.");
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    loadGoals(controller.signal);
    return () => controller.abort();
  }, [loadGoals, requestVersion]);

  useEffect(() => {
    const controller = new AbortController();
    client.get("/goals", { signal: controller.signal })
      .then(({ data }) => {
        const counts = { active: 0, completed: 0, abandoned: 0 };
        data.goals.forEach((goal) => {
          if (counts[goal.status] !== undefined) counts[goal.status] += 1;
        });
        setGoalCounts(counts);
      })
      .catch(() => {
        // The stat strip is a convenience; the tab-filtered goal list still loads without it.
      });
    return () => controller.abort();
  }, [requestVersion]);

  useEffect(() => {
    const controller = new AbortController();
    client.get("/resources/tags", { signal: controller.signal })
      .then(({ data }) => setTagOptions(data.tags))
      .catch(() => {
        // Autocomplete is a convenience; typing a tag manually still works without it.
      });
    return () => controller.abort();
  }, []);

  const tagSuggestions = useMemo(() => {
    const input = tagInput.trim().toLowerCase();
    if (!input) return [];
    return tagOptions
      .filter((option) => option.toLowerCase().includes(input))
      .filter((option) => !tags.some((tag) => tag.toLowerCase() === option.toLowerCase()))
      .slice(0, MAX_TAG_SUGGESTIONS);
  }, [tagInput, tagOptions, tags]);

  useEffect(() => {
    if (deleteConfirmId === null) return undefined;
    const timeout = setTimeout(() => setDeleteConfirmId(null), 4000);
    return () => clearTimeout(timeout);
  }, [deleteConfirmId]);

  useEffect(() => {
    if (!addGoalOpen) return undefined;
    const timeout = window.setTimeout(() => setAddGoalVisible(true), 10);
    return () => window.clearTimeout(timeout);
  }, [addGoalOpen]);

  useEffect(() => {
    if (!addGoalOpen) return undefined;
    function handleKeyDown(event) {
      if (event.key === "Escape") closeAddGoalModal();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [addGoalOpen]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  function closeAddGoalModal() {
    setAddGoalVisible(false);
    window.setTimeout(() => setAddGoalOpen(false), 180);
  }

  function openAddGoalModal() {
    setForm(EMPTY_FORM);
    setTags([]);
    setTagInput("");
    setFormError("");
    setAddGoalOpen(true);
  }

  function addTags(values) {
    setTags((current) => mergeTags(current, values));
    setTagInput("");
    setFormError("");
  }

  function commitTagInput() {
    const values = tagInput.split(/[,;\n]+/);
    if (values.some((value) => normaliseTag(value))) addTags(values);
  }

  function handleTagKeyDown(event) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitTagInput();
      return;
    }

    if (event.key === "Backspace" && !tagInput && tags.length) {
      setTags((current) => current.slice(0, -1));
    }
  }

  function removeTag(tagToRemove) {
    setTags((current) => current.filter((tag) => tag !== tagToRemove));
  }

  async function handleCreateGoal(event) {
    event.preventDefault();
    setFormError("");

    const pendingTag = normaliseTag(tagInput);
    const tagsToSave = mergeTags(tags, pendingTag ? [pendingTag] : []);
    if (!form.title.trim() || !tagsToSave.length) {
      setFormError("Add a goal title and at least one skill or topic.");
      return;
    }

    setSubmitting(true);
    try {
      await client.post("/goals", {
        title: form.title.trim(),
        targetTags: tagsToSave.join(", "),
        targetDate: form.targetDate || undefined,
      });
      setForm(EMPTY_FORM);
      setTags([]);
      setTagInput("");
      setRequestVersion((version) => version + 1);
      closeAddGoalModal();
    } catch (requestError) {
      setFormError(requestError.response?.data?.message || "Your goal could not be saved. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(goalId, nextStatus) {
    setStatusPendingIds((current) => new Set(current).add(goalId));
    setGoals((current) => current.map((goal) => (goal.id === goalId ? { ...goal, status: nextStatus } : goal)));

    try {
      await client.patch(`/goals/${goalId}`, { status: nextStatus });
      setRequestVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "That goal could not be updated. Please try again.");
      setRequestVersion((version) => version + 1);
    } finally {
      setStatusPendingIds((current) => {
        const next = new Set(current);
        next.delete(goalId);
        return next;
      });
    }
  }

  async function handleUpdateGoal(goalId, updates) {
    await client.patch(`/goals/${goalId}`, updates);
    setRequestVersion((version) => version + 1);
  }

  async function handleDelete(goalId) {
    if (deleteConfirmId !== goalId) {
      setDeleteConfirmId(goalId);
      return;
    }

    setDeleteConfirmId(null);
    setDeletePendingIds((current) => new Set(current).add(goalId));
    try {
      await client.delete(`/goals/${goalId}`);
      setGoals((current) => current.filter((goal) => goal.id !== goalId));
      setRequestVersion((version) => version + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "That goal could not be deleted. Please try again.");
    } finally {
      setDeletePendingIds((current) => {
        const next = new Set(current);
        next.delete(goalId);
        return next;
      });
    }
  }

  return (
    <div className="min-h-[100dvh] bg-stone-50 text-stone-950 dark:bg-stone-950 dark:text-stone-100">
      <DashboardHeader onLogout={handleLogout} userName={user?.name || "Student"} />

      <section className="border-b border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="mx-auto max-w-5xl px-3 py-8 sm:px-4 sm:py-10 lg:px-6 lg:py-10">
          <div className="flex flex-wrap items-end justify-between gap-6">
            <header className="max-w-lg">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Your goals</h1>
              <p className="mt-3 text-base leading-7 text-stone-600 dark:text-stone-400">
                Set a goal around the skills you want to build, and Pathwise tracks your progress from the
                courses you complete.
              </p>
            </header>

            <dl className="flex flex-wrap gap-x-7 gap-y-3">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Active</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-terracotta-800 dark:text-terracotta-300">
                  {goalCounts.active ?? "–"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Completed</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-green-700 dark:text-green-400">
                  {goalCounts.completed ?? "–"}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-stone-500 dark:text-stone-400">Abandoned</dt>
                <dd className="mt-1 font-display text-2xl font-bold text-stone-500 dark:text-stone-400">
                  {goalCounts.abandoned ?? "–"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-5xl px-3 py-8 sm:px-4 sm:py-10 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Goal views" className="inline-flex flex-wrap rounded-xl border border-stone-300 bg-white p-1 dark:border-stone-700 dark:bg-stone-900">
            {TABS.map(({ key, label }) => (
              <button
                aria-current={statusFilter === key ? "page" : undefined}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-terracotta-700 dark:focus-visible:outline-terracotta-400 ${
                  statusFilter === key
                    ? "bg-terracotta-800 text-white dark:bg-terracotta-400 dark:text-stone-950"
                    : "text-stone-600 hover:text-terracotta-800 dark:text-stone-400 dark:hover:text-terracotta-300"
                }`}
                key={key}
                onClick={() => setStatusFilter(key)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>

          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-terracotta-800 px-4 text-sm font-bold text-white transition-colors hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300"
            onClick={openAddGoalModal}
            type="button"
          >
            <PlusCircle aria-hidden="true" size={18} weight="bold" />
            Add goal
          </button>
        </div>

        <div aria-busy={loading} className="mt-6">
          {error ? (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-6 py-10 text-center dark:border-red-900 dark:bg-red-950/40">
              <WarningCircle aria-hidden="true" className="mx-auto text-red-700 dark:text-red-400" size={28} weight="bold" />
              <h2 className="mt-4 font-display text-lg font-bold text-red-950 dark:text-red-100">Unable to load your goals</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-red-900 dark:text-red-200">{error}</p>
              <button
                className="mt-5 min-h-11 rounded-xl bg-red-900 px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-red-800 active:translate-y-px dark:bg-red-200 dark:text-red-950"
                onClick={() => setRequestVersion((version) => version + 1)}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : loading ? (
            <LoadingRegion label="Loading your goals">
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 2 }, (_, index) => (
                  <Skeleton className="h-48 rounded-2xl" key={index} />
                ))}
              </div>
            </LoadingRegion>
          ) : goals.length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {goals.map((goal) => (
                <GoalCard
                  deleteConfirming={deleteConfirmId === goal.id}
                  deletePending={deletePendingIds.has(goal.id)}
                  goal={goal}
                  key={goal.id}
                  onDelete={handleDelete}
                  onStatusChange={handleStatusChange}
                  onUpdate={handleUpdateGoal}
                  statusPending={statusPendingIds.has(goal.id)}
                  tagOptions={tagOptions}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 px-6 py-12 text-center dark:border-stone-700">
              <Flag aria-hidden="true" className="mx-auto text-terracotta-700 dark:text-terracotta-300" size={32} weight="bold" />
              <h2 className="mt-4 font-display text-lg font-bold">
                {statusFilter === "all" ? "No goals yet" : `No ${statusFilter} goals`}
              </h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-stone-600 dark:text-stone-400">
                {statusFilter === "all"
                  ? "Add a goal to start tracking progress toward the skills you care about."
                  : "Goals you move here will show up in this view."}
              </p>
              <button
                className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-terracotta-700 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950"
                onClick={openAddGoalModal}
                type="button"
              >
                <PlusCircle aria-hidden="true" size={18} weight="bold" />
                Add a goal
              </button>
            </div>
          )}
        </div>
      </main>

      {addGoalOpen && createPortal(
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4 backdrop-blur-sm motion-safe:transition-opacity motion-safe:duration-200 ${
            addGoalVisible ? "opacity-100" : "opacity-0"
          }`}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAddGoalModal();
          }}
          role="presentation"
        >
          <section
            aria-labelledby="add-goal-title"
            aria-modal="true"
            className={`max-h-[92dvh] w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-[0_28px_90px_rgb(0_0_0/0.28)] motion-safe:transition-[opacity,transform] motion-safe:duration-200 motion-safe:ease-out dark:border-stone-700 dark:bg-stone-900 ${
              addGoalVisible ? "scale-100 opacity-100" : "scale-95 opacity-0"
            }`}
            role="dialog"
          >
            <header className="flex items-start justify-between gap-5 border-b border-stone-200 px-5 py-4 dark:border-stone-800">
              <div className="flex items-center gap-3">
                <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-terracotta-100 text-terracotta-800 dark:bg-terracotta-950 dark:text-terracotta-300">
                  <Target aria-hidden="true" size={21} weight="bold" />
                </span>
                <h2 className="font-display text-lg font-bold" id="add-goal-title">Add a new goal</h2>
              </div>
              <button
                aria-label="Close"
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-stone-300 text-stone-600 transition-[transform,border-color,color] duration-150 hover:border-terracotta-700 hover:text-terracotta-800 focus-visible:outline-2 focus-visible:outline-terracotta-700 active:scale-[0.97] dark:border-stone-700 dark:text-stone-300 dark:hover:border-terracotta-400 dark:hover:text-terracotta-300"
                onClick={closeAddGoalModal}
                type="button"
              >
                <X aria-hidden="true" size={19} weight="bold" />
              </button>
            </header>

            <form className="max-h-[calc(92dvh-4.75rem)] overflow-auto p-5" onSubmit={handleCreateGoal}>
              <div className="grid gap-4">
                <label>
                  <span className="text-sm font-bold text-stone-800 dark:text-stone-200">Goal title</span>
                  <input
                    autoFocus
                    className={INPUT_CLASS}
                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                    placeholder="e.g. Become a data analyst"
                    type="text"
                    value={form.title}
                  />
                </label>

                <div>
                  <span className="text-sm font-bold text-stone-800 dark:text-stone-200">Skills or topics</span>
                  <TagChipInput
                    inputId="goal-tags"
                    onAddSuggestion={(suggestion) => addTags([suggestion])}
                    onBlur={commitTagInput}
                    onKeyDown={handleTagKeyDown}
                    onRemoveTag={removeTag}
                    onTagInputChange={setTagInput}
                    placeholder={tags.length ? "Add another" : "e.g. Python, SQL"}
                    suggestions={tagSuggestions}
                    tagInput={tagInput}
                    tags={tags}
                  />
                  <span className="mt-1.5 block text-xs text-stone-500 dark:text-stone-400" id="goal-tags-help">
                    Type and press Enter. Pathwise matches these against course skills and field tags to compute progress.
                  </span>
                </div>

                <label>
                  <span className="text-sm font-bold text-stone-800 dark:text-stone-200">Target date (optional)</span>
                  <input
                    className={INPUT_CLASS}
                    min={TODAY}
                    onChange={(event) => setForm({ ...form, targetDate: event.target.value })}
                    type="date"
                    value={form.targetDate}
                  />
                </label>

                {formError && (
                  <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" role="alert">
                    {formError}
                  </div>
                )}

                <button
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-terracotta-800 px-5 text-sm font-bold text-white transition-colors hover:bg-terracotta-900 focus-visible:outline-2 focus-visible:outline-terracotta-700 disabled:cursor-wait disabled:opacity-70 active:translate-y-px dark:bg-terracotta-400 dark:text-stone-950 dark:hover:bg-terracotta-300"
                  disabled={submitting}
                  type="submit"
                >
                  {submitting ? (
                    <SpinnerGap aria-hidden="true" className="motion-safe:animate-spin" size={18} weight="bold" />
                  ) : (
                    <PlusCircle aria-hidden="true" size={18} weight="bold" />
                  )}
                  Add goal
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
