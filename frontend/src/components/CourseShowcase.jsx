import {
  ArrowRight,
  Briefcase,
  ChartBar,
  Code,
  PaintBrush,
  Star,
} from "@phosphor-icons/react";
import { AnimatePresence, motion as Motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";

const courseGroups = [
  {
    id: "data-ai",
    label: "Data & AI",
    icon: ChartBar,
    courses: [
      {
        id: 59,
        title: "Advanced Learning Algorithms",
        provider: "Coursera",
        rating: "4.9",
        type: "Course",
        art: 0,
        reason: "Builds neural-network, tree-ensemble, and model-development skills for deeper machine-learning work.",
      },
      {
        id: 535,
        title: "Data Visualization and Dashboards with Excel and Cognos",
        provider: "Coursera",
        rating: "4.7",
        type: "Course",
        art: 2,
        reason: "Turns analysis into readable dashboards using Excel, Cognos, and practical visualisation techniques.",
      },
      {
        id: 3410,
        title: "Microsoft Future Ready: Principles of Machine Learning with Python Programming",
        provider: "FutureLearn",
        type: "Course",
        art: 1,
        reason: "Introduces machine-learning principles through practical Python-based study.",
      },
    ],
  },
  {
    id: "software",
    label: "Software",
    icon: Code,
    courses: [
      {
        id: 67,
        title: "Advanced Styling with Responsive Design",
        provider: "Coursera",
        rating: "4.7",
        type: "Course",
        art: 1,
        reason: "Strengthens responsive CSS, Bootstrap, and front-end JavaScript skills.",
      },
      {
        id: 4411,
        title: "Responsive Web Design Fundamentals",
        provider: "Udacity",
        difficulty: "Intermediate",
        type: "Course",
        art: 2,
        reason: "Builds practical layout skills for websites that adapt cleanly across devices.",
      },
      {
        id: 181,
        title: "AWS Cloud Technical Essentials",
        provider: "Coursera",
        rating: "4.8",
        type: "Course",
        art: 0,
        reason: "Covers cloud architecture, networking, identity management, and AWS security.",
      },
    ],
  },
  {
    id: "business",
    label: "Business",
    icon: Briefcase,
    courses: [
      {
        id: 816,
        title: "Foundations of Project Management",
        provider: "Coursera",
        rating: "4.9",
        type: "Course",
        art: 2,
        reason: "Develops project planning, strategic thinking, change management, and organisational awareness.",
      },
      {
        id: 33,
        title: "Adapt Your Leadership Style",
        provider: "Coursera",
        rating: "4.8",
        type: "Course",
        art: 0,
        reason: "Builds communication, staff management, and practical leadership-development skills.",
      },
      {
        id: 2343,
        title: "Business Management and Leadership",
        provider: "FutureLearn",
        type: "Course",
        art: 1,
        reason: "Explores the core management and leadership decisions involved in guiding a team.",
      },
    ],
  },
  {
    id: "design",
    label: "Design",
    icon: PaintBrush,
    courses: [
      {
        id: 823,
        title: "Foundations of User Experience (UX) Design",
        provider: "Coursera",
        rating: "4.8",
        type: "Course",
        art: 1,
        reason: "Introduces UX research, wireframes, prototypes, and user-centred design practice.",
      },
      {
        id: 2603,
        title: "Digital Skills: User Experience",
        provider: "FutureLearn",
        type: "Course",
        art: 2,
        reason: "Builds a practical foundation for understanding users and improving digital experiences.",
      },
      {
        id: 4584,
        title: "Adobe Illustrator CC - Print Design for Beginners",
        provider: "Udemy",
        difficulty: "Beginner",
        type: "Course",
        art: 0,
        reason: "Builds practical print-design and illustration skills using Adobe Illustrator.",
      },
    ],
  },
];

function CourseCard({ course, featured }) {
  return (
    <Link
      className="course-showcase-card"
      data-featured={featured ? "true" : "false"}
      to={`/resources/${course.id}`}
    >
      <div
        aria-hidden="true"
        className="course-showcase-card__art"
        style={{ "--course-art-position": `${course.art * 50}%` }}
      />
      <div className="course-showcase-card__body">
        <div className="course-showcase-card__source">
          <span>{course.provider}</span>
          {course.rating && (
            <span className="course-showcase-card__rating" aria-label={`Rated ${course.rating} out of 5`}>
              <Star size={15} weight="fill" aria-hidden="true" /> {course.rating}
            </span>
          )}
        </div>
        <h3>{course.title}</h3>
        <div className="course-showcase-card__meta">
          {course.difficulty && <span>{course.difficulty}</span>}
          <span>{course.type}</span>
        </div>
        <p><strong>Why it may fit:</strong> {course.reason}</p>
      </div>
    </Link>
  );
}

export default function CourseShowcase() {
  const [activeGroupId, setActiveGroupId] = useState(courseGroups[0].id);
  const reduceMotion = useReducedMotion();
  const activeGroup = courseGroups.find((group) => group.id === activeGroupId) ?? courseGroups[0];

  function handleTabKeyDown(event, index) {
    let nextIndex;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % courseGroups.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + courseGroups.length) % courseGroups.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = courseGroups.length - 1;
    else return;

    event.preventDefault();
    setActiveGroupId(courseGroups[nextIndex].id);
    event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[nextIndex]?.focus();
  }

  return (
    <div className="course-showcase">
      <div className="course-showcase__intro">
        <p className="course-showcase__count"><strong>7,974</strong> courses across five platforms</p>
        <h2 id="courses-heading">Explore what you could learn next.</h2>
        <p>Browse a sample from the catalogue, then build your profile to receive recommendations matched to your programme, skills, and goals.</p>
        <Link className="course-showcase__link group" to="/catalogue">
          Browse all courses
          <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" size={18} weight="bold" aria-hidden="true" />
        </Link>
      </div>

      <div className="course-showcase__browser">
        <div className="course-showcase__tabs" role="tablist" aria-label="Course categories">
          {courseGroups.map((group, index) => {
            const Icon = group.icon;
            const selected = group.id === activeGroup.id;
            return (
              <button
                aria-controls="course-showcase-panel"
                aria-selected={selected}
                className="course-showcase__tab"
                data-active={selected ? "true" : "false"}
                id={`course-tab-${group.id}`}
                key={group.id}
                onClick={() => setActiveGroupId(group.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                role="tab"
                tabIndex={selected ? 0 : -1}
                type="button"
              >
                <Icon size={17} weight="duotone" aria-hidden="true" />
                {group.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <Motion.div
            animate={{ opacity: 1, y: 0 }}
            aria-labelledby={`course-tab-${activeGroup.id}`}
            className="course-showcase__grid"
            exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
            id="course-showcase-panel"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            key={activeGroup.id}
            role="tabpanel"
            transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            {activeGroup.courses.map((course, index) => (
              <CourseCard course={course} featured={index === 0} key={course.title} />
            ))}
          </Motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
