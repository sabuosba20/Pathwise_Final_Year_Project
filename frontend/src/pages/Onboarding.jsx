import {
  ArrowRight,
  CheckCircle,
  Compass,
  FilePdf,
  Lightbulb,
  Plus,
  ShieldCheck,
  UploadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";

import client from "../api/client";
import ThemeToggle from "../components/ThemeToggle";
import useAuth from "../context/useAuth";
import { FIELD_OPTIONS, getSkillSuggestions, mergeSkills, normaliseSkill } from "../utils/learningProfile";

const TODAY = new Date().toISOString().slice(0, 10);

export default function Onboarding() {
  const [form, setForm] = useState({ fieldOfStudy: "", learningGoals: "" });
  const [skills, setSkills] = useState([]);
  const [skillInput, setSkillInput] = useState("");
  const [goalForm, setGoalForm] = useState({ title: "", targetDate: "" });
  const [goalTags, setGoalTags] = useState([]);
  const [goalTagInput, setGoalTagInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [cvError, setCvError] = useState("");
  const [cvResult, setCvResult] = useState(null);
  const fileInputRef = useRef(null);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const skillSuggestions = useMemo(() => {
    return getSkillSuggestions(form.fieldOfStudy, skills);
  }, [form.fieldOfStudy, skills]);

  function updateField(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function addSkills(values) {
    setSkills((current) => mergeSkills(current, values));
    setSkillInput("");
    setError("");
  }

  function commitSkillInput() {
    const values = skillInput.split(/[,;\n]+/);
    if (values.some((value) => normaliseSkill(value))) addSkills(values);
  }

  function handleSkillKeyDown(event) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitSkillInput();
      return;
    }

    if (event.key === "Backspace" && !skillInput && skills.length) {
      setSkills((current) => current.slice(0, -1));
    }
  }

  function removeSkill(skillToRemove) {
    setSkills((current) => current.filter((skill) => skill !== skillToRemove));
  }

  function addGoalTags(values) {
    setGoalTags((current) => mergeSkills(current, values));
    setGoalTagInput("");
  }

  function commitGoalTagInput() {
    const values = goalTagInput.split(/[,;\n]+/);
    if (values.some((value) => normaliseSkill(value))) addGoalTags(values);
  }

  function handleGoalTagKeyDown(event) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commitGoalTagInput();
      return;
    }

    if (event.key === "Backspace" && !goalTagInput && goalTags.length) {
      setGoalTags((current) => current.slice(0, -1));
    }
  }

  function removeGoalTag(tagToRemove) {
    setGoalTags((current) => current.filter((tag) => tag !== tagToRemove));
  }

  async function handleCvUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setCvError("");
    setCvResult(null);
    if (file.size > 5 * 1024 * 1024) {
      setCvError("Choose a CV that is 5 MB or smaller.");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!['pdf', 'docx'].includes(extension)) {
      setCvError("Choose a PDF or DOCX CV.");
      return;
    }

    const upload = new FormData();
    upload.append("cv", file);
    setExtracting(true);
    try {
      const { data } = await client.post("/preferences/cv-extract", upload);
      const detectedSkills = data.skills || [];
      setForm((current) => ({
        ...current,
        fieldOfStudy: data.fieldOfStudy || current.fieldOfStudy,
      }));
      if (detectedSkills.length) setSkills((current) => mergeSkills(current, detectedSkills));
      setCvResult({
        fileName: file.name,
        fieldOfStudy: data.fieldOfStudy,
        skillCount: detectedSkills.length,
        warnings: data.warnings || [],
      });
    } catch (requestError) {
      setCvError(
        requestError.response?.data?.message
          || requestError.response?.data?.msg
          || "Unable to read this CV.",
      );
    } finally {
      setExtracting(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const pendingSkill = normaliseSkill(skillInput);
    const skillsToSave = mergeSkills(skills, pendingSkill ? [pendingSkill] : []);
    if (!skillsToSave.length) {
      setError("Add at least one current skill before continuing.");
      return;
    }

    setSkills(skillsToSave);
    setSkillInput("");
    setSubmitting(true);

    try {
      const { data } = await client.put("/preferences", {
        ...form,
        skills: skillsToSave.join(", "),
      });
      setUser(data.user);

      const pendingGoalTag = normaliseSkill(goalTagInput);
      const goalTagsToSave = mergeSkills(goalTags, pendingGoalTag ? [pendingGoalTag] : []);
      if (goalForm.title.trim()) {
        try {
          await client.post("/goals", {
            title: goalForm.title.trim(),
            targetTags: goalTagsToSave.join(", "),
            targetDate: goalForm.targetDate || undefined,
          });
        } catch {
          // Setting a goal here is optional -- it can always be added later
          // from the account's Goals page, so a failure here should not
          // block onboarding.
        }
      }

      navigate("/dashboard", { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save your preferences.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="onboarding-screen">
      <header className="onboarding-header">
        <Link
          aria-label="Pathwise home"
          className="onboarding-brand"
          to="/"
        >
          <span className="onboarding-brand__mark">
            <Compass aria-hidden="true" size={18} weight="bold" />
          </span>
          <span>Pathwise</span>
        </Link>

        <div className="flex items-center gap-2">
          <p className="onboarding-header__note">
            <ShieldCheck aria-hidden="true" size={17} weight="bold" />
            <span className="hidden sm:inline">Your answers stay editable</span>
            <span className="sm:hidden">Editable later</span>
          </p>
          <ThemeToggle className="size-10 px-0" />
        </div>
      </header>

      <div className="onboarding-body">
        <section className="onboarding-intro">
          <Compass
            aria-hidden="true"
            className="onboarding-intro__watermark"
            size={280}
            weight="thin"
          />

          <div className="onboarding-intro__copy">
            <p className="onboarding-intro__label">Your learning profile</p>
            <h1>Start where you are.</h1>
            <p>
              Three answers help Pathwise rank your first courses around your programme, skills, and goal.
            </p>
          </div>

          <p className="onboarding-intro__assurance">
            <ShieldCheck aria-hidden="true" size={18} weight="bold" />
            You can change every answer later.
          </p>
        </section>

        <section className="onboarding-form-pane">
          <form className="onboarding-form" onSubmit={handleSubmit}>
            <div className="onboarding-form__heading">
              <h2>Complete three lines.</h2>
              <p>Upload a CV to fill the first two, or enter them yourself.</p>
            </div>

            <div className="onboarding-cv" aria-live="polite">
              <input
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={handleCvUpload}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="onboarding-cv__button"
                disabled={extracting || submitting}
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                {extracting ? (
                  <FilePdf aria-hidden="true" size={19} weight="bold" />
                ) : (
                  <UploadSimple aria-hidden="true" size={19} weight="bold" />
                )}
                <span>{extracting ? "Reading your CV..." : "Fill from my CV"}</span>
              </button>
              <p>PDF or DOCX, up to 5 MB. Processed temporarily and not stored.</p>
            </div>

            {cvResult && (
              <div className="onboarding-cv-result">
                <CheckCircle aria-hidden="true" size={20} weight="fill" />
                <div>
                  <strong>Suggestions added for review</strong>
                  <p>
                    {cvResult.fieldOfStudy || "No major detected"} · {cvResult.skillCount} skills detected
                  </p>
                  {cvResult.warnings.map((warning) => <small key={warning}>{warning}</small>)}
                </div>
              </div>
            )}

            {cvError && (
              <div className="onboarding-cv-error" role="alert">
                <WarningCircle aria-hidden="true" size={18} weight="bold" />
                <p>{cvError}</p>
              </div>
            )}

            <div className="onboarding-fields">
              <label className="onboarding-line" htmlFor="onboarding-field-of-study">
                <span className="onboarding-line__prompt">
                  I study
                  <span>Required</span>
                </span>
                <input
                  autoComplete="organization-title"
                  id="onboarding-field-of-study"
                  list="onboarding-field-options"
                  name="fieldOfStudy"
                  onChange={updateField}
                  placeholder="Computer Science"
                  required
                  type="text"
                  value={form.fieldOfStudy}
                />
                <datalist id="onboarding-field-options">
                  {FIELD_OPTIONS.map((field) => <option key={field} value={field} />)}
                </datalist>
                <small>Use your university programme name.</small>
              </label>

              <div className="onboarding-line">
                <label className="onboarding-line__prompt" htmlFor="onboarding-skills">
                  I can already
                  <span>Required</span>
                </label>
                <div className="onboarding-skill-entry">
                  {skills.map((skill) => (
                    <span className="onboarding-skill-tag" key={skill}>
                      {skill}
                      <button aria-label={`Remove ${skill}`} onClick={() => removeSkill(skill)} type="button">
                        <X aria-hidden="true" size={13} weight="bold" />
                      </button>
                    </span>
                  ))}
                  <input
                    aria-describedby="onboarding-skills-help"
                    id="onboarding-skills"
                    maxLength={60}
                    onBlur={commitSkillInput}
                    onChange={(event) => setSkillInput(event.target.value)}
                    onKeyDown={handleSkillKeyDown}
                    placeholder={skills.length ? "Add another skill" : "Type a skill"}
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
                <small id="onboarding-skills-help">Type one skill and press Enter. Backspace removes the last skill.</small>
                {skillSuggestions.length > 0 && (
                  <div className="onboarding-suggestions" aria-label="Suggested skills">
                    <span><Lightbulb aria-hidden="true" size={14} weight="bold" /> Suggestions</span>
                    {skillSuggestions.map((suggestion) => (
                      <button onClick={() => addSkills([suggestion])} type="button" key={suggestion}>
                        <Plus aria-hidden="true" size={13} weight="bold" />
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <label className="onboarding-line" htmlFor="onboarding-learning-goals">
                <span className="onboarding-line__prompt">
                  I want to learn
                  <span>Optional</span>
                </span>
                <input
                  id="onboarding-learning-goals"
                  name="learningGoals"
                  onChange={updateField}
                  placeholder="Build stronger data analysis skills"
                  type="text"
                  value={form.learningGoals}
                />
                <small>Describe the ability you want to build next.</small>
              </label>

              <label className="onboarding-line" htmlFor="onboarding-goal-title">
                <span className="onboarding-line__prompt">
                  Track a goal
                  <span>Optional</span>
                </span>
                <input
                  id="onboarding-goal-title"
                  onChange={(event) => setGoalForm({ ...goalForm, title: event.target.value })}
                  placeholder="Become a data analyst"
                  type="text"
                  value={goalForm.title}
                />
                <small>
                  Pathwise tracks your progress as you complete matching courses. Skip this --
                  you can add or edit goals anytime from your account.
                </small>
              </label>

              {goalForm.title.trim() && (
                <>
                  <div className="onboarding-line">
                    <label className="onboarding-line__prompt" htmlFor="onboarding-goal-tags">
                      Skills for this goal
                      <span>Optional</span>
                    </label>
                    <div className="onboarding-skill-entry">
                      {goalTags.map((tag) => (
                        <span className="onboarding-skill-tag" key={tag}>
                          {tag}
                          <button aria-label={`Remove ${tag}`} onClick={() => removeGoalTag(tag)} type="button">
                            <X aria-hidden="true" size={13} weight="bold" />
                          </button>
                        </span>
                      ))}
                      <input
                        aria-describedby="onboarding-goal-tags-help"
                        id="onboarding-goal-tags"
                        maxLength={60}
                        onBlur={commitGoalTagInput}
                        onChange={(event) => setGoalTagInput(event.target.value)}
                        onKeyDown={handleGoalTagKeyDown}
                        placeholder={goalTags.length ? "Add another" : "e.g. Python, SQL"}
                        type="text"
                        value={goalTagInput}
                      />
                      {goalTagInput.trim() && (
                        <button className="onboarding-skill-add" onMouseDown={(event) => event.preventDefault()} onClick={commitGoalTagInput} type="button">
                          <Plus aria-hidden="true" size={15} weight="bold" />
                          Add
                        </button>
                      )}
                    </div>
                    <small id="onboarding-goal-tags-help">Type one skill or topic and press Enter.</small>
                  </div>

                  <label className="onboarding-line" htmlFor="onboarding-goal-date">
                    <span className="onboarding-line__prompt">
                      Target date
                      <span>Optional</span>
                    </span>
                    <input
                      id="onboarding-goal-date"
                      min={TODAY}
                      onChange={(event) => setGoalForm({ ...goalForm, targetDate: event.target.value })}
                      type="date"
                      value={goalForm.targetDate}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="onboarding-error-slot">
              {error && (
                <div className="onboarding-error" role="alert">
                  <WarningCircle aria-hidden="true" size={18} weight="bold" />
                  <p>{error}</p>
                </div>
              )}
            </div>

            <div className="onboarding-actions">
              <p>Your answers are used to shape recommendations.</p>
              <button disabled={submitting || extracting} type="submit">
                <span>{submitting ? "Saving..." : "Find my courses"}</span>
                {!submitting && <ArrowRight aria-hidden="true" size={18} weight="bold" />}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
