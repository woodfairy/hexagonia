export interface ToastMessage {
  id: string;
  tone: "error" | "success" | "info";
  title: string;
  body?: string;
}

export function ToastStack(props: {
  toasts: ToastMessage[];
  onDismiss: (toastId: string) => void;
}) {
  return (
    <div className="toast-stack" aria-live="polite" aria-atomic="true">
      {props.toasts.map((toast) => (
        <article key={toast.id} className={`toast-card is-${toast.tone}`}>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.body ? <span>{toast.body}</span> : null}
          </div>
          <button type="button" className="ghost-button toast-close" onClick={() => props.onDismiss(toast.id)}>
            Schliessen
          </button>
        </article>
      ))}
    </div>
  );
}
