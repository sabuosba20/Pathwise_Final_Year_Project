import LegalLayout from "../components/LegalLayout";

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display text-xl font-bold tracking-tight text-stone-950 dark:text-stone-100">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated="26 July 2026">
      <p>
        Pathwise is a university final-year project built to research and demonstrate personalised course
        recommendations. It is not a commercial product, and this policy explains what data the project collects
        and how it is used.
      </p>

      <Section title="What we collect">
        <p>
          When you register, we collect your name and email address and store a one-way hash of your password. You
          may optionally add your date of birth in Account settings. To personalise recommendations, you can
          provide a degree programme, current skills, and learning goals.
        </p>
        <p>
          As you use the catalogue, we record which courses you view, save, open, rate, mark as completed, or give
          feedback on ("more like this" / "not interested"). We also record which recommendations were shown and
          their positions so later actions can be evaluated against what you actually saw. This activity data is
          what powers the recommendation engine — it is the core subject of this project's research.
        </p>
      </Section>

      <Section title="How it's used">
        <p>
          Your data is used only to operate your account and to generate and evaluate course recommendations for
          you. It is not sold, shared with advertisers, or used for any purpose outside this project.
        </p>
      </Section>

      <Section title="Where it's stored">
        <p>
          Data is stored in the project's database for the duration of development and evaluation. Your
          authentication session is held in a short-lived, HttpOnly browser cookie and ends when you log out,
          close the browser, or the session expires.
        </p>
      </Section>

      <Section title="Your choices">
        <p>
          You can review and edit your learning profile at any time from your Profile page, and update your account
          details or password from Account settings. You can permanently delete your account and all associated
          data from Account settings — this removes your saved courses, ratings, self-reported completions,
          recommendation history, activity history, and preferences.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          Questions about this project or your data can be directed to the student developer through the
          university's usual FYP supervision channels.
        </p>
      </Section>
    </LegalLayout>
  );
}
