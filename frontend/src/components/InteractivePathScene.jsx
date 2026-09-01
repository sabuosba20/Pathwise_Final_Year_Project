import {
  BookOpenText,
  Compass,
  GraduationCap,
  Sparkle,
  UsersThree,
} from "@phosphor-icons/react";
import {
  AnimatePresence,
  motion as Motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { useState } from "react";

const spring = { stiffness: 120, damping: 20, mass: 0.7 };
const cardSpring = { type: "spring", stiffness: 155, damping: 22, mass: 0.75 };

const sceneCardOrder = ["profile", "match", "peers"];
const sceneCardPositions = [
  { x: "0%", y: -8, z: 140, rotateY: 0, rotateZ: 0, scale: 1, opacity: 1 },
  { x: "68%", y: 92, z: 18, rotateY: -11, rotateZ: 3, scale: 0.78, opacity: 0.58 },
  { x: "-72%", y: -96, z: 4, rotateY: 11, rotateZ: -3, scale: 0.78, opacity: 0.58 },
];

const sceneSteps = [
  {
    id: "profile",
    label: "Profile signals",
    copy: "Your degree programme, skills, preferences, and goals give Pathwise a useful starting point.",
  },
  {
    id: "match",
    label: "Course match",
    copy: "Course topics are compared with your programme and current skills to find relevant learning.",
  },
  {
    id: "peers",
    label: "Peer context",
    copy: "Interactions from students in similar programmes with overlapping skills help refine the result.",
  },
];

function getCardPosition(cardId, activeStep) {
  const activeIndex = sceneCardOrder.indexOf(activeStep);
  const cardIndex = sceneCardOrder.indexOf(cardId);
  const slot = (cardIndex - activeIndex + sceneCardOrder.length) % sceneCardOrder.length;
  const position = sceneCardPositions[slot];

  return {
    ...position,
    scale: slot === 0 && cardId !== "match" ? 1.18 : position.scale,
  };
}

export default function InteractivePathScene() {
  const [activeStep, setActiveStep] = useState("match");
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const rotateY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-9, 9]), spring);
  const rotateX = useSpring(useTransform(pointerY, [-0.5, 0.5], [7, -7]), spring);

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

  return (
    <div
      className="path-scene"
      onPointerMove={handlePointerMove}
      onPointerLeave={resetPointer}
      role="group"
      aria-label="Interactive example of a Pathwise course recommendation"
    >
      <Motion.div
        className="path-scene__stage"
        style={{ rotateX: reduceMotion ? 0 : rotateX, rotateY: reduceMotion ? 0 : rotateY }}
      >
        <div className="path-scene__ring path-scene__ring--outer" aria-hidden="true" />
        <div className="path-scene__ring path-scene__ring--inner" aria-hidden="true" />
        <div className="path-scene__connector path-scene__connector--one" aria-hidden="true" />
        <div className="path-scene__connector path-scene__connector--two" aria-hidden="true" />
        <span className="path-scene__pulse path-scene__pulse--one" aria-hidden="true" />
        <span className="path-scene__pulse path-scene__pulse--two" aria-hidden="true" />

        <Motion.div
          className="scene-position scene-position--profile"
          animate={getCardPosition("profile", activeStep)}
          initial={false}
          style={{ zIndex: activeStep === "profile" ? 6 : 2 }}
          transition={reduceMotion ? { duration: 0 } : cardSpring}
        >
          <Motion.button
            className="scene-card scene-card--profile"
            data-active={activeStep === "profile"}
            type="button"
            aria-pressed={activeStep === "profile"}
            onClick={() => setActiveStep("profile")}
            animate={reduceMotion ? { scale: activeStep === "profile" ? 1.04 : 1 } : { y: [0, -8, 0], scale: activeStep === "profile" ? 1.06 : 1, z: activeStep === "profile" ? 24 : 0 }}
            transition={{ y: { duration: 4.8, repeat: Infinity, ease: "easeInOut" }, scale: { type: "spring", stiffness: 180, damping: 18 }, z: { type: "spring", stiffness: 180, damping: 18 } }}
          >
            <div className="scene-card__icon"><GraduationCap size={20} weight="duotone" /></div>
            <div>
              <p className="scene-card__label">Your profile</p>
              <p className="scene-card__title">Business Management</p>
              <p className="scene-card__meta">Research, Excel, teamwork</p>
            </div>
          </Motion.button>
        </Motion.div>

        <Motion.div
          className="scene-position scene-position--course"
          animate={getCardPosition("match", activeStep)}
          initial={false}
          style={{ zIndex: activeStep === "match" ? 6 : 4 }}
          transition={reduceMotion ? { duration: 0 } : cardSpring}
        >
          <Motion.button
            className="scene-card scene-card--course"
            data-active={activeStep === "match"}
            type="button"
            aria-pressed={activeStep === "match"}
            onClick={() => setActiveStep("match")}
            animate={{ z: activeStep === "match" && !reduceMotion ? 28 : 0, scale: activeStep === "match" ? 1.035 : 1 }}
            whileHover={reduceMotion ? undefined : { z: 36, scale: 1.055 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
          >
            <div className="scene-card__source">
              <span><BookOpenText size={18} weight="bold" /> Coursera</span>
              <Sparkle size={18} weight="fill" aria-hidden="true" />
            </div>
            <div className="scene-card__course-icon"><BookOpenText size={30} weight="duotone" /></div>
            <p className="scene-card__title scene-card__title--large">Foundations of Project Management</p>
            <div className="scene-card__reason">
              <Compass size={18} weight="duotone" />
              <span>Matches your programme and builds on planning and teamwork skills.</span>
            </div>
          </Motion.button>
        </Motion.div>

        <Motion.div
          className="scene-position scene-position--peers"
          animate={getCardPosition("peers", activeStep)}
          initial={false}
          style={{ zIndex: activeStep === "peers" ? 6 : 3 }}
          transition={reduceMotion ? { duration: 0 } : cardSpring}
        >
          <Motion.button
            className="scene-card scene-card--peers"
            data-active={activeStep === "peers"}
            type="button"
            aria-pressed={activeStep === "peers"}
            onClick={() => setActiveStep("peers")}
            animate={reduceMotion ? { scale: activeStep === "peers" ? 1.04 : 1 } : { y: [0, 7, 0], scale: activeStep === "peers" ? 1.06 : 1, z: activeStep === "peers" ? 24 : 0 }}
            transition={{ y: { duration: 5.4, repeat: Infinity, ease: "easeInOut", delay: 0.4 }, scale: { type: "spring", stiffness: 180, damping: 18 }, z: { type: "spring", stiffness: 180, damping: 18 } }}
          >
            <div className="scene-card__icon"><UsersThree size={20} weight="duotone" /></div>
            <div>
              <p className="scene-card__label">Peer signal</p>
              <p className="scene-card__title">Useful to similar learners</p>
              <div className="scene-card__avatars" aria-hidden="true">
                <span>AR</span><span>NS</span><span>MK</span>
              </div>
            </div>
          </Motion.button>
        </Motion.div>
      </Motion.div>

      <div className="path-scene__story">
        <div className="path-scene__tabs" aria-label="Explore the recommendation flow">
          {sceneSteps.map((step) => (
            <button
              type="button"
              data-active={activeStep === step.id}
              aria-pressed={activeStep === step.id}
              onClick={() => setActiveStep(step.id)}
              key={step.id}
            >
              {step.label}
            </button>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <Motion.p
            key={activeStep}
            initial={reduceMotion ? false : { opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -5 }}
            transition={{ duration: reduceMotion ? 0 : 0.24 }}
            aria-live="polite"
          >
            {sceneSteps.find((step) => step.id === activeStep)?.copy}
          </Motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
