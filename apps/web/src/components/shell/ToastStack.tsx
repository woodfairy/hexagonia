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
  const latestToast = props.toasts.at(-1) ?? null;

  if (!latestToast) {
    return null;
  }

  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      <article key={latestToast.id} className={`toast-card is-${latestToast.tone}`}>
        <div className="toast-copy">
          <strong>{resolveText(locale, latestToast.title)}</strong>
          {latestToast.body ? <span>{resolveText(locale, latestToast.body)}</span> : null}
        </div>
        <button type="button" className="ghost-button toast-close" onClick={() => props.onDismiss(latestToast.id)}>
          {resolveText(locale, createText("Schließen", "Close"))}
        </button>
      </article>
    </div>
  );
}
