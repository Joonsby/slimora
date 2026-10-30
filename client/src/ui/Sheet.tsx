import type { ReactNode } from 'react';
import { IconClose } from './icons';

interface SheetProps {
  open: boolean;
  title: string;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}

/** 아래에서 올라오는 시트. 열려 있어도 뒤의 전투는 계속된다 */
export function Sheet({ open, title, icon, onClose, children }: SheetProps) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <div className="sheet-header">
          {icon && <span className="sheet-icon">{icon}</span>}
          <h2>{title}</h2>
          <button className="close" onClick={onClose} aria-label="닫기">
            <IconClose size={18} />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
