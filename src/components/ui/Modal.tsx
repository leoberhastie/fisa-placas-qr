import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  closeDisabled?: boolean;
  size?: 'default' | 'wide';
}

export function Modal({ title, onClose, children, closeDisabled = false, size = 'default' }: ModalProps) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose, closeDisabled]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-primary/60 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className={`max-h-[94vh] w-full animate-[modal-in_200ms_ease-out] overflow-y-auto rounded-t-2xl bg-card shadow-xl sm:rounded-2xl ${size === 'wide' ? 'max-w-7xl' : 'max-w-lg'}`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border/60 bg-card px-6 py-4">
          <h2 id="modal-title" className="text-lg font-semibold text-primary">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Cerrar"
            className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-muted-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
