import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode } from 'react';

type ExitArticle = (navigate: () => void) => void;
const ArticleExit = createContext<ExitArticle>(navigate => navigate());
const offscreen = 'translateX(100%)';

export function useCompanionArticleExit(navigate: () => void) {
  const exit = useContext(ArticleExit);
  return useCallback(() => exit(navigate), [exit, navigate]);
}

function canAnimate(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

type Motion = { animation: Animation | null; mounted: boolean; leaving: boolean; changed(moving: boolean): void };

function playMotion(element: HTMLElement, motion: Motion, keyframes: Keyframe[],
  options: KeyframeAnimationOptions, navigate?: () => void) {
  const animation = element.animate(keyframes, options);
  motion.animation = animation;
  motion.changed(true);
  const finish = () => {
    if (!motion.mounted || motion.animation !== animation) return;
    motion.animation = null;
    motion.leaving = false;
    animation.cancel();
    motion.changed(false);
    navigate?.();
  };
  void animation.finished.then(finish, finish);
}

export function CompanionArticleTransition(props: {
  children: ReactNode;
  onMotionChange(moving: boolean): void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const { onMotionChange } = props;
  const motion = useRef<Motion>({ animation: null, mounted: false, leaving: false, changed: onMotionChange });
  motion.current.changed = onMotionChange;

  useLayoutEffect(() => {
    const current = motion.current;
    current.mounted = true;
    const element = surface.current;
    if (canAnimate(element)) {
      playMotion(element, current, [{ transform: offscreen }, { transform: 'translateX(0)' }], {
        duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
      });
    }
    return () => {
      current.mounted = false;
      current.animation?.cancel();
      current.animation = null;
      current.leaving = false;
      current.changed(false);
    };
  }, []);

  const exit = useCallback<ExitArticle>((navigate) => {
    const current = motion.current;
    if (current.leaving) return;
    const element = surface.current;
    if (!canAnimate(element)) { navigate(); return; }
    const transform = getComputedStyle(element).transform;
    current.animation?.cancel();
    current.leaving = true;
    playMotion(element, current, [{ transform }, { transform: offscreen }], {
      duration: 160, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards'
    }, navigate);
  }, []);

  return <ArticleExit.Provider value={exit}>
    <div className="fixed inset-0 z-surface-raised bg-companion-base"
      data-companion-article-transition ref={surface}>
      {props.children}
    </div>
  </ArticleExit.Provider>;
}
