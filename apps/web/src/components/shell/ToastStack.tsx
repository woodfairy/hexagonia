import { createText, resolveText, useI18n, type LocalizedText } from "../../i18n";

export interface ToastMessage {
  id: string;
  tone: "error" | "success" | "info";
  title: LocalizedText;
  body?: LocalizedText;
}

export function ToastStack(props: {
  toasts: ToastMessage[];
  onDismiss: (toastId: string) => void;
}) {
  const { locale } = useI18n();

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {props.toasts.map((toast) => (
        <article key={toast.id} className={`toast-card is-${toast.tone}`}>
          <div className="toast-copy">
            <strong>{resolveText(locale, toast.title)}</strong>
            {toast.body ? <span>{resolveText(locale, toast.body)}</span> : null}
          </div>
          <button type="button" className="ghost-button toast-close" onClick={() => props.onDismiss(toast.id)}>
            {resolveText(locale, createText("Schließen", "Close"))}
          </button>
        </article>
      ))}
    </div>
  );
}
