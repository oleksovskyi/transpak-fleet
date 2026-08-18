import { createContext, ReactNode, useCallback, useContext, useState } from 'react';

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface AlertOptions {
  title?: string;
}

interface DialogState {
  kind: 'confirm' | 'alert';
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  resolve: (value: boolean) => void;
}

interface DialogContextValue {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  alertMsg: (message: string, options?: AlertOptions) => Promise<void>;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DialogState | null>(null);

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ kind: 'confirm', message, resolve, ...options });
    });
  }, []);

  const alertMsg = useCallback((message: string, options?: AlertOptions) => {
    return new Promise<void>((resolve) => {
      setState({ kind: 'alert', message, resolve: () => resolve(), ...options });
    });
  }, []);

  function close(result: boolean) {
    state?.resolve(result);
    setState(null);
  }

  return (
    <DialogContext.Provider value={{ confirm, alertMsg }}>
      {children}
      {state && (
        <div className="dialog-overlay" onClick={() => close(false)}>
          <div className="dialog-card" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">
              {state.title ?? (state.kind === 'confirm' ? 'Підтвердження' : 'Повідомлення')}
            </div>
            <div className="dialog-message">{state.message}</div>
            <div className="dialog-actions">
              {state.kind === 'confirm' && (
                <button className="btn" onClick={() => close(false)}>
                  {state.cancelText ?? 'Скасувати'}
                </button>
              )}
              <button
                className={`btn btn-primary${state.danger ? ' btn-danger' : ''}`}
                onClick={() => close(true)}
                autoFocus
              >
                {state.kind === 'confirm' ? state.confirmText ?? 'Підтвердити' : 'Гаразд'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog має використовуватись всередині DialogProvider');
  return ctx;
}
