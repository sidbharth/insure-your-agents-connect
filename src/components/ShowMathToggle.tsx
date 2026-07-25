/**
 * Global "Show the math" toggle (REQ-6.7, decision D4, AC-14). Lives in the
 * product header; off by default; state persists across screens (it lives in
 * the store, not the route).
 */
import { useStore } from '../store';

export interface ShowMathToggleProps {
  className?: string;
}

export function ShowMathToggle({ className = '' }: ShowMathToggleProps) {
  const showMath = useStore((s) => s.showMath);
  const setShowMath = useStore((s) => s.setShowMath);

  return (
    <button
      type="button"
      data-testid="show-math-toggle"
      aria-pressed={showMath}
      onClick={() => setShowMath(!showMath)}
      className={`flex items-center gap-2 whitespace-nowrap text-xs text-[#c6ccc8] ${className}`}
    >
      <span
        className={`relative h-[19px] w-[34px] flex-none rounded-full transition-colors ${
          showMath ? 'bg-accent' : 'bg-white/20'
        }`}
      >
        <span
          className={`absolute top-0.5 h-[15px] w-[15px] rounded-full bg-white shadow transition-all ${
            showMath ? 'left-[17px]' : 'left-0.5'
          }`}
        />
      </span>
      Show the math
    </button>
  );
}
