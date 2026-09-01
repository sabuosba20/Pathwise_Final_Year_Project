import {
  motion as Motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { useEffect, useRef, useState } from "react";

const revealWindows = [
  [0, 0.1],
  [0.24, 0.34],
  [0.48, 0.58],
  [0.7, 0.8],
];

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const handleChange = (event) => setIsDesktop(event.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return isDesktop;
}

function ProgressiveFlowItem({ item, index, progress, pinned }) {
  const [start, end] = revealWindows[index];
  const opacity = useTransform(progress, [start, end], [0, 1]);
  const y = useTransform(progress, [start, end], [28, 0]);
  const scale = useTransform(progress, [start, end], [0.97, 1]);
  const Icon = item.icon;
  const Arrow = item.arrow;

  const animationProps =
    pinned && index === 0
      ? {}
      : pinned
        ? { style: { opacity, y, scale } }
        : {
            initial: { opacity: 0, y: 24 },
            whileInView: { opacity: 1, y: 0 },
            viewport: { once: true, amount: 0.4 },
            transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
          };

  return (
    <Motion.li className="learning-flow__item" {...animationProps}>
      <div className="learning-flow__icon">
        <Icon size={24} weight="duotone" aria-hidden="true" />
      </div>
      <h3 className="mt-5 font-display text-xl font-bold tracking-tight">
        {item.title}
      </h3>
      <p className="mt-2 leading-7 text-stone-600 dark:text-stone-400">
        {item.copy}
      </p>
      {index < 3 && (
        <Arrow
          className="learning-flow__arrow"
          size={20}
          weight="bold"
          aria-hidden="true"
        />
      )}
    </Motion.li>
  );
}

export default function ProgressiveFlow({ children, items }) {
  const containerRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const isDesktop = useIsDesktop();
  const pinned = isDesktop && !reduceMotion;

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, {
    stiffness: 210,
    damping: 32,
    mass: 0.4,
  });

  return (
    <div
      className="learning-flow-scroll"
      data-pinned={pinned ? "true" : "false"}
      ref={containerRef}
    >
      <div className="learning-flow-scroll__sticky">
        {children}
        <ol className="learning-flow">
          {items.map((item, index) => (
            <ProgressiveFlowItem
              index={index}
              item={item}
              key={item.title}
              pinned={pinned}
              progress={progress}
            />
          ))}
        </ol>
      </div>
    </div>
  );
}
