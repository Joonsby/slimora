import { useEffect, useRef, type ReactNode } from 'react';

interface HoldButtonProps {
  /** false 를 돌려주면 연속 실행을 멈춘다 */
  onFire: () => boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}

const HOLD_DELAY_MS = 400;
const REPEAT_MS = 90;

/** 누르면 한 번, 길게 누르면 연속 실행 */
export function HoldButton({ onFire, disabled, className, children }: HoldButtonProps) {
  const timer = useRef<number | null>(null);
  const fire = useRef(onFire);

  useEffect(() => {
    fire.current = onFire;
  }, [onFire]);

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  useEffect(() => stop, []);

  const repeat = () => {
    if (!fire.current()) return stop();
    timer.current = window.setTimeout(repeat, REPEAT_MS);
  };

  const start = () => {
    stop();
    if (!fire.current()) return;
    timer.current = window.setTimeout(repeat, HOLD_DELAY_MS);
  };

  return (
    <button
      className={className}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          fire.current();
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </button>
  );
}
