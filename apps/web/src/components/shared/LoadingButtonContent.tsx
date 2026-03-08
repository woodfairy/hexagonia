export function LoadingButtonContent(props: {
  loading: boolean;
  idleLabel: string;
  loadingLabel: string;
}) {
  return props.loading ? (
    <span className="button-loading-content">
      <span className="button-loading-spinner" aria-hidden="true" />
      <span>{props.loadingLabel}</span>
    </span>
  ) : (
    <span>{props.idleLabel}</span>
  );
}
