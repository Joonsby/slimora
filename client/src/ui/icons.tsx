import type { SVGProps } from 'react';

/** 게임 UI 아이콘. 이모지는 기기마다 모양이 달라 쓰지 않는다 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const Svg = ({ size = 24, children, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const IconSword = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14.5 3.5 L20.5 3.5 L20.5 9.5 L10 20 L7 20 L4 17 L4 14 Z" fill="#e8eef6" stroke="#46526a" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M18 6 L8.5 15.5" stroke="#9aa7b8" strokeWidth="1.6" strokeLinecap="round" />
    <path d="M3 13.5 L10.5 21" stroke="#8a5a2b" strokeWidth="3" strokeLinecap="round" />
    <circle cx="4.2" cy="19.8" r="2" fill="#ffc233" stroke="#8a5a2b" strokeWidth="1.2" />
  </Svg>
);

export const IconHeart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 20.5 C 5 15.5 2.5 12 2.5 8.5 C 2.5 5.5 4.8 3.5 7.4 3.5 C 9.3 3.5 11 4.6 12 6.3 C 13 4.6 14.7 3.5 16.6 3.5 C 19.2 3.5 21.5 5.5 21.5 8.5 C 21.5 12 19 15.5 12 20.5 Z" fill="#ff5a6e" stroke="#a3233a" strokeWidth="1.6" strokeLinejoin="round" />
    <ellipse cx="7.5" cy="8" rx="2.4" ry="1.4" transform="rotate(-30 7.5 8)" fill="#fff" opacity=".7" />
  </Svg>
);

export const IconCrit = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 1.5 L14.3 8.4 L21.5 8.6 L15.8 13 L17.9 20.2 L12 16 L6.1 20.2 L8.2 13 L2.5 8.6 L9.7 8.4 Z" fill="#ffd84a" stroke="#b36b00" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M10 9.5 L12 6 L14 9.5" stroke="#fff" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity=".8" />
  </Svg>
);

export const IconMap = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6 L8.5 4 L15.5 6.5 L21 4.5 L21 18 L15.5 20 L8.5 17.5 L3 19.5 Z" fill="#f4e2b8" stroke="#8a5a2b" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M8.5 4 L8.5 17.5 M15.5 6.5 L15.5 20" stroke="#c9a46a" strokeWidth="1.3" />
    <path d="M10.5 11.5 L13.5 14.5 M13.5 11.5 L10.5 14.5" stroke="#e5484d" strokeWidth="1.8" strokeLinecap="round" />
  </Svg>
);

export const IconAbsorb = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 C 16 8 19 11 19 14.5 C 19 18.4 15.9 21 12 21 C 8.1 21 5 18.4 5 14.5 C 5 11 8 8 12 3 Z" fill="#b18cff" stroke="#5a2d9c" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 14 C 9 11.8 11 11 12.4 12 C 13.8 13 13.2 15.6 11.4 15.6" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    <ellipse cx="9.2" cy="9.8" rx="1.6" ry="1" transform="rotate(-40 9.2 9.8)" fill="#fff" opacity=".7" />
  </Svg>
);

export const IconEvolve = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2 L13.8 9 L21 12 L13.8 15 L12 22 L10.2 15 L3 12 L10.2 9 Z" fill="#ffe27a" stroke="#c27a00" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="19" cy="5" r="1.6" fill="#ffe27a" stroke="#c27a00" strokeWidth="1" />
    <circle cx="5" cy="19" r="1.2" fill="#ffe27a" stroke="#c27a00" strokeWidth="1" />
  </Svg>
);

export const IconCoin = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9.5" fill="#ffc233" stroke="#a86400" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="6" fill="none" stroke="#d68a00" strokeWidth="1.4" />
    <path d="M9 7.5 Q 10.5 6.5 12 7" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity=".85" />
  </Svg>
);

export const IconAuto = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12 A 8 8 0 0 1 18 7 M20 12 A 8 8 0 0 1 6 17" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" />
    <path d="M18.5 3 L18.5 7.5 L14 7.5 M5.5 21 L5.5 16.5 L10 16.5" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconSpeed = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5 L12 12 L4 19 Z M12 5 L20 12 L12 19 Z" fill="currentColor" strokeLinejoin="round" />
  </Svg>
);

export const IconFlag = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21 L5 3" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    <path d="M6 4 L19 6.5 L15 10 L19 13.5 L6 14 Z" fill="currentColor" strokeLinejoin="round" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" />
    <path d="M8 10.5 V 8 a 4 4 0 0 1 8 0 V 10.5" stroke="currentColor" strokeWidth="2.4" fill="none" />
  </Svg>
);

export const IconCrown = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8 L7.5 12 L12 4.5 L16.5 12 L21 8 L19 19 L5 19 Z" fill="#ffd84a" stroke="#a86400" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="12" cy="14.5" r="1.8" fill="#e5484d" />
  </Svg>
);

export const IconSound = ({ muted, ...p }: IconProps & { muted?: boolean }) => (
  <Svg {...p}>
    <path d="M4 9.5 H8 L13 5 V19 L8 14.5 H4 Z" fill="currentColor" strokeLinejoin="round" />
    {muted ? (
      <path d="M16.5 9.5 L21.5 14.5 M21.5 9.5 L16.5 14.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    ) : (
      <path d="M16.5 8.5 Q 19 12 16.5 15.5 M19 6 Q 23 12 19 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
    )}
  </Svg>
);

export const IconPlay = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="19" height="15" rx="4" fill="currentColor" opacity=".25" />
    <path d="M10 8.5 L16 12 L10 15.5 Z" fill="currentColor" strokeLinejoin="round" />
  </Svg>
);

export const IconRebirth = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.5 A 8.5 8.5 0 1 1 4.2 8.6" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" />
    <path d="M2.8 4.2 L4.4 9.4 L9.4 7.6" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8 L13.4 11 L16.5 11.3 L14.1 13.4 L14.9 16.5 L12 14.8 L9.1 16.5 L9.9 13.4 L7.5 11.3 L10.6 11 Z" fill="#fff2a8" stroke="#fff" strokeWidth="0.8" strokeLinejoin="round" />
  </Svg>
);

export const IconEssence = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5 L19.5 9 L12 21.5 L4.5 9 Z" fill="#5ee4ff" stroke="#1677a8" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M4.5 9 L19.5 9 M12 2.5 L9 9 L12 21.5 L15 9 Z" stroke="#1677a8" strokeWidth="1" fill="none" strokeLinejoin="round" />
    <path d="M8 6.5 L10 5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15.5 3 A 9 9 0 1 0 21 15.5 A 7 7 0 0 1 15.5 3 Z" fill="#ffd84a" stroke="#b36b00" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="18.5" cy="5" r="1.2" fill="#ffd84a" />
  </Svg>
);

export const IconGem = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3.5 H17 L21.5 9 L12 21 L2.5 9 Z" fill="#ff6fb5" stroke="#a3205f" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M2.5 9 H21.5 M7 3.5 L9.5 9 L12 21 L14.5 9 L17 3.5" stroke="#a3205f" strokeWidth="1" fill="none" strokeLinejoin="round" />
    <path d="M5.5 8 L8 5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
  </Svg>
);

export const IconParty = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 19 C 3 12 8 9 9.5 9 C 11 9 14 12 14 19 Z" fill="#8fd3ff" stroke="#1d5c8a" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M11 19 C 11 13 15 10.5 16.5 10.5 C 18 10.5 21 13 21 19 Z" fill="#ffd84a" stroke="#9a6a00" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="8" cy="14.5" r="0.9" fill="#1d2530" /><circle cx="11" cy="14.5" r="0.9" fill="#1d2530" />
    <circle cx="15.2" cy="15.5" r="0.9" fill="#1d2530" /><circle cx="18" cy="15.5" r="0.9" fill="#1d2530" />
    <path d="M16.5 3.5 L17.4 5.6 L19.6 5.8 L17.9 7.2 L18.4 9.4 L16.5 8.2 L14.6 9.4 L15.1 7.2 L13.4 5.8 L15.6 5.6 Z" fill="#fff" />
  </Svg>
);

export const IconTrophy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3.5 H17 V9 A 5 5 0 0 1 7 9 Z" fill="#ffd84a" stroke="#a86400" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M7 5 H4 V7 A 3 3 0 0 0 7 10 M17 5 H20 V7 A 3 3 0 0 1 17 10" stroke="#a86400" strokeWidth="1.5" fill="none" />
    <path d="M10.5 13.5 H13.5 V17 H10.5 Z M7.5 17 H16.5 V20.5 H7.5 Z" fill="#ffc233" stroke="#a86400" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M9.5 5.5 V8.5" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity=".8" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6 L18 18 M18 6 L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </Svg>
);

export const IconCaret = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 9 L12 15 L18 9" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

export const IconArrow = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12 L19 12 M13 6 L19 12 L13 18" stroke="currentColor" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);
