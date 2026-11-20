import React, { useState, useEffect, useRef } from 'react';
import { Settings, User } from '../types';
import { ShieldAlert, KeyRound, Lock, X } from 'lucide-react';

interface SupervisorPinModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string[];
  settings?: Settings;
  users?: User[];
  onSuccess: () => void;
  onCancel: () => void;
}

export const SupervisorPinModal: React.FC<SupervisorPinModalProps> = ({
  isOpen,
  title,
  message,
  details,
  settings,
  users = [],
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const verifyPin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const entered = pin.trim();
    if (!entered) {
      setError('يرجى إدخال كود اعتماد المدير أولاً');
      return;
    }

    const masterPin = (settings?.supervisorPin || '1234').trim();
    const matchesMaster = entered === masterPin;
    const matchesAdminPass = users.some(
      (u) =>
        u.status !== 'disabled' &&
        (u.role === 'admin' || u.role === 'company_admin' || u.role === 'owner') &&
        u.password &&
        u.password.trim() === entered
    );

    if (matchesMaster || matchesAdminPass) {
      setError('');
      onSuccess();
    } else {
      setError('كود المدير غير صحيح، يرجى المحاولة مرة أخرى');
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4" dir="rtl">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-l from-amber-600 to-rose-700 text-white">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h3 className="font-bold text-sm sm:text-base truncate">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/20 transition-colors shrink-0"
            aria-label="إغلاق"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={verifyPin} className="p-4 sm:p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs sm:text-sm text-amber-900 leading-relaxed">
            {message}
          </div>

          {details && details.length > 0 && (
            <ul className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1.5 text-xs text-slate-700 max-h-36 overflow-y-auto">
              {details.map((d, idx) => (
                <li key={idx} className="flex items-start gap-1.5">
                  <span className="text-rose-600 font-bold">•</span>
                  <span className="break-words">{d}</span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-slate-500" />
              <span>أدخل كود اعتماد المدير / المشرف (PIN)</span>
            </label>
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => {
                setPin(e.target.value);
                if (error) setError('');
              }}
              placeholder="أدخل الكود السري..."
              className="w-full px-3.5 py-2.5 text-center tracking-widest text-base font-bold bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 tabular-nums"
            />
            {error && <p className="mt-1.5 text-xs font-semibold text-rose-600">{error}</p>}
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs sm:text-sm hover:bg-slate-50 transition-colors"
            >
              إلغاء وتراجع
            </button>
            <button
              type="submit"
              className="w-full sm:flex-1 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Lock className="w-4 h-4" />
              <span>اعتماد وتجاوز القيد</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
