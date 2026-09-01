import {
  ArrowRight,
  BookOpenText,
  Brain,
  Briefcase,
  Browsers,
  Compass,
  UsersThree,
} from "@phosphor-icons/react";
import { useState } from "react";
import {
  AnimatePresence,
  motion as Motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";

const courses = [
  {
    goal: "Lead a project",
    title: "Foundations of Project Management",
    provider: "Coursera",
    skills: "Planning, teamwork, communication",
    reason: "Supports your Business Management programme and builds on your organisation and communication skills.",
    peer: "Students in similar business programmes with overlapping skills saved this course.",
    icon: Briefcase,
  },
  {
    goal: "Understand behaviour",
    title: "Introduction to Psychology",
    provider: "Coursera",
    skills: "Research, behaviour, critical thinking",
    reason: "Connects your interest in people with research and analysis skills used across Psychology and Education.",
    peer: "Students in related social science programmes found this useful for building a shared foundation.",
    icon: Brain,
  },
  {
    goal: "Build digital skills",
    title: "Become a HTML and CSS Developer - Build a Responsive Site",
    provider: "Udemy",
    skills: "HTML, CSS, responsive design",
    reason: "Adds practical digital skills to your Multimedia or IT programme and builds on your design interests.",
    peer: "Students with similar creative and technical skills completed this path before advanced web topics.",
    icon: Browsers,
  },
];

const deckTransforms = [
  { x: 0, y: 0, z: 110, rotateY: -3, rotateZ: -1, scale: 1, opacity: 1 },
  { x: 58, y: 38, z: 15, rotateY: -12, rotateZ: 4, scale: 0.92, opacity: 0.82 },
  { x: -44, y: 68, z: -70, rotateY: 11, rotateZ: -5, scale: 0.84, opacity: 0.56 },
];

const pointerSpring = { stiffness: 110, damping: 22, mass: 0.75 };

export default function RecommendationDeck() {
  const [activeIndex, setActiveIndex] = useState(0);
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-7, 7]), pointerSpring);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [5, -5]), pointerSpring);
  const activeCourse = courses[activeIndex];

  function selectCourse(index) {
    setActiveIndex(index);
  }

  function moveDeck(direction) {
    setActiveIndex((current) => (current + direction + courses.length) % courses.length);
  }

  function handlePointerMove(event) {
    if (reduceMotion) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - bounds.left) / bounds.width - 0.5);
    pointerY.set((event.clientY - bounds.top) / bounds.height - 0.5);
  }

  function resetPointer() {
    pointerX.set(0);
    pointerY.set(0);
  }

  function handleDragEnd(_, info) {
    const projectedSwipe = info.offset.x + info.velocity.x * 0.12;
    if (projectedSwipe < -62) moveDeck(1);
    if (projectedSwipe > 62) moveDeck(-1);
  }

  return (
    <div className="recommendation-lab__grid">
      <div className="recommendation-lab__controls">
        <div className="goal-switcher" aria-label="Choose a learning goal">
          {courses.map((course, index) => {
            const Icon = course.icon;
            const selected = index === activeIndex;
            return (
              <button
                className="goal-switcher__button"
                data-active={selected}
                type="button"
                aria-pressed={selected}
                onClick={() => selectCourse(index)}
                key={course.goal}
              >
                <span className="goal-switcher__icon"><Icon size={22} weight="duotone" aria-hidden="true" /></span>
                <span>{course.goal}</span>
                <ArrowRight className="goal-switcher__arrow" size={18} weight="bold" aria-hidden="true" />
              </button>
            );
          })}
        </div>

        <div className="recommendation-detail" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <Motion.div
              key={activeCourse.goal}
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="recommendation-detail__row">
                <Compass size={19} weight="duotone" aria-hidden="true" />
                <div>
                  <p className="recommendation-detail__label">Why this fits</p>
                  <p>{activeCourse.reason}</p>
                </div>
              </div>
              <div className="recommendation-detail__row">
                <UsersThree size={19} weight="duotone" aria-hidden="true" />
                <div>
                  <p className="recommendation-detail__label">Peer context</p>
                  <p>{activeCourse.peer}</p>
                </div>
              </div>
            </Motion.div>
          </AnimatePresence>
        </div>

        <div className="recommendation-logic" aria-label="How Pathwise creates the recommendation">
          <span><Compass size={17} weight="duotone" aria-hidden="true" /> Profile</span>
          <ArrowRight size={15} weight="bold" aria-hidden="true" />
          <span><BookOpenText size={17} weight="duotone" aria-hidden="true" /> Content match</span>
          <span className="recommendation-logic__plus" aria-hidden="true">+</span>
          <span><UsersThree size={17} weight="duotone" aria-hidden="true" /> Peer patterns</span>
          <ArrowRight size={15} weight="bold" aria-hidden="true" />
          <span><BookOpenText size={17} weight="duotone" aria-hidden="true" /> Ranked result</span>
        </div>
      </div>

      <div
        className="course-deck"
        onPointerMove={handlePointerMove}
        onPointerLeave={resetPointer}
        role="group"
        aria-label="Interactive three-dimensional course recommendation deck"
      >
        <Motion.div
          className="course-deck__stage"
          style={{ rotateX: reduceMotion ? 0 : rotateX, rotateY: reduceMotion ? 0 : rotateY }}
        >
          {courses.map((course, index) => {
            const slot = (index - activeIndex + courses.length) % courses.length;
            const transform = deckTransforms[slot];
            const Icon = course.icon;
            const isActive = slot === 0;
            return (
              <Motion.button
                className="deck-card"
                data-active={isActive}
                data-slot={slot}
                type="button"
                aria-pressed={isActive}
                aria-label={`${isActive ? "Selected" : "Select"} ${course.title}`}
                onClick={() => (isActive ? moveDeck(1) : selectCourse(index))}
                animate={reduceMotion ? { ...transform, x: transform.x * 0.45, y: transform.y * 0.55 } : transform}
                transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 145, damping: 20, mass: 0.8 }}
                style={{ zIndex: courses.length - slot }}
                drag={isActive && !reduceMotion ? "x" : false}
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.16}
                dragSnapToOrigin
                onDragEnd={handleDragEnd}
                whileTap={reduceMotion ? undefined : { scale: isActive ? 0.985 : transform.scale }}
                key={course.title}
              >
                <span className="deck-card__topline">
                  <span>{course.provider}</span>
                  <span className="deck-card__icon"><Icon size={22} weight="duotone" aria-hidden="true" /></span>
                </span>
                <span className="deck-card__body">
                  <BookOpenText size={32} weight="duotone" aria-hidden="true" />
                  <strong>{course.title}</strong>
                  <small>{course.skills}</small>
                </span>
                <span className="deck-card__footer">
                  <Compass size={18} weight="duotone" aria-hidden="true" />
                  <span>Recommended for your path</span>
                </span>
              </Motion.button>
            );
          })}
        </Motion.div>
        <p className="course-deck__hint">Swipe or tap the front card, or choose a goal</p>
      </div>
    </div>
  );
}
