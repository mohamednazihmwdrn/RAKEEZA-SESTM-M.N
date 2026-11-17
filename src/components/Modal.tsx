import React, { useEffect } from 'react';
import { registerModalBackHandler } from '../utils/navigationHistory';

interface ModalProps {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, title, onClose, children, footer, maxWidth = 'max-w-4xl' }) => {
  // Prevent body scroll and register phone back button listener when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const unregister = registerModalBackHandler(() => {
        onClose();
        return true;
      });
      return () => {
        document.body.style.overflow = 'unset';
        unregister();
      };
    } else {
      document.body.style.overflow = 'unset';
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-[1px] z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`bg-white rounded-t-2xl sm:rounded-2xl p-3.5 sm:p-6 ${maxWidth} w-full max-h-[95vh] sm:max-h-[92vh] flex flex-col shadow-xl border border-slate-200 animate-slideUp sm:animate-none`}>
        {/* Modal Header */}
        <div className="flex justify-between items-center pb-3 mb-3 border-b border-slate-200 shrink-0 gap-2">
          <h3 className="text-base sm:text-lg font-semibold text-slate-900 truncate pl-2">{title}</h3>
          <button
            onClick={onClose}
            className="w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-100 hover:bg-rose-600 text-slate-700 hover:text-white text-lg font-semibold transition cursor-pointer shrink-0"
            aria-label="إغلاق النافذة"
          >
            ✕
          </button>
        </div>

        {/* Modal Content with smooth touch scrolling */}
        <div className="overflow-y-auto overscroll-contain flex-1 pr-0.5 -mr-0.5">{children}</div>

        {/* Modal Footer (if provided) */}
        {footer && (
          <div className="pt-3 mt-3 border-t border-slate-200 shrink-0 bg-slate-50 -mx-3.5 -mb-3.5 sm:-mx-6 sm:-mb-6 p-3.5 sm:p-4 rounded-b-2xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

