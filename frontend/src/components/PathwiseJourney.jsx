import {
  motion as Motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

const path = "M 84 0 C 90 9 61 12 68 22 C 77 34 95 31 82 43 C 69 55 23 46 30 61 C 36 73 83 68 75 81 C 68 92 49 91 54 100";

export default function PathwiseJourney() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 82,
    damping: 24,
    mass: 0.55,
  });
  const firstNode = useTransform(smoothProgress, [0.08, 0.16], [0.15, 1]);
  const secondNode = useTransform(smoothProgress, [0.27, 0.39], [0.15, 1]);
  const thirdNode = useTransform(smoothProgress, [0.49, 0.62], [0.15, 1]);
  const fourthNode = useTransform(smoothProgress, [0.7, 0.82], [0.15, 1]);

  return (
    <div className="journey-path" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">
        <path className="journey-path__rail" d={path} pathLength="1" />
        <Motion.path
          className="journey-path__progress"
          d={path}
          pathLength="1"
          style={{ pathLength: reduceMotion ? 1 : smoothProgress }}
        />
        <Motion.circle className="journey-path__node" cx="68" cy="22" r="0.75" style={{ opacity: reduceMotion ? 1 : firstNode }} />
        <Motion.circle className="journey-path__node" cx="82" cy="43" r="0.75" style={{ opacity: reduceMotion ? 1 : secondNode }} />
        <Motion.circle className="journey-path__node" cx="30" cy="61" r="0.75" style={{ opacity: reduceMotion ? 1 : thirdNode }} />
        <Motion.circle className="journey-path__node" cx="75" cy="81" r="0.75" style={{ opacity: reduceMotion ? 1 : fourthNode }} />
      </svg>
    </div>
  );
}
