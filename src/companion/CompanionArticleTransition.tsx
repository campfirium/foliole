import { createContext, useCallback, useContext, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

type ExitArticle = (navigate: () => void) => void;
const ArticleExit = createContext<ExitArticle>(navigate => navigate());
const offscreen = 'translateX(100%)';
const recessed = 'translateX(-20%)';

export function useCompanionArticleExit(navigate: () => void) {
  const exit = useContext(ArticleExit);
  return useCallback(() => exit(navigate), [exit, navigate]);
}

function canAnimate(element: HTMLElement | null): element is HTMLElement {
  return Boolean(element?.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

type Motion = {
  animation: Animation | null;
  backdrop: HTMLElement | null;
  backdropAnimation: Animation | null;
  mounted: boolean;
  leaving: boolean;
  changed(moving: boolean): void;
};

function moveBackdrop(motion: Motion, options: KeyframeAnimationOptions, departing: boolean) {
  const element = motion.backdrop;
  if (!element) return;
  const from = getComputedStyle(element).transform;
  motion.backdropAnimation?.cancel();
  const animation = element.animate([
    { transform: from }, { transform: departing ? 'translateX(0)' : recessed }
  ], { ...options, fill: 'forwards' });
  motion.backdropAnimation = animation;
  void animation.finished.catch(() => undefined);
}

function settleBackdrop(motion: Motion, departing: boolean) {
  if (motion.backdrop) motion.backdrop.style.transform = departing ? 'translateX(0)' : recessed;
  motion.backdropAnimation?.cancel();
  motion.backdropAnimation = null;
}

function playMotion(element: HTMLElement, motion: Motion, keyframes: Keyframe[],
  options: KeyframeAnimationOptions, navigate?: () => void) {
  const animation = element.animate(keyframes, options);
  motion.animation = animation;
  moveBackdrop(motion, options, Boolean(navigate));
  motion.changed(true);
  const finish = () => {
    if (!motion.mounted || motion.animation !== animation) return;
    motion.animation = null;
    settleBackdrop(motion, Boolean(navigate));
    if (navigate) {
      // Keep the outgoing page offscreen and the list revealed until React unmounts it.
      element.style.transform = offscreen;
      animation.cancel();
      navigate();
      return;
    }
    motion.leaving = false;
    animation.cancel();
    motion.changed(false);
  };
  void animation.finished.then(finish, finish);
}

export function CompanionArticleTransition(props: {
  backdropRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
  onMotionChange(moving: boolean): void;
}) {
  const surface = useRef<HTMLDivElement>(null);
  const { onMotionChange, backdropRef } = props;
  const motion = useRef<Motion>({ animation: null, backdrop: null, backdropAnimation: null,
    mounted: false, leaving: false, changed: onMotionChange });
  motion.current.changed = onMotionChange;

  useLayoutEffect(() => {
    const current = motion.current;
    current.mounted = true;
    current.backdrop = backdropRef.current;
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
      current.backdropAnimation?.cancel();
      current.backdropAnimation = null;
      if (current.backdrop) current.backdrop.style.transform = '';
      current.leaving = false;
      current.changed(false);
    };
  }, [backdropRef]);

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
