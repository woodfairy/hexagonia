import type { Locale } from "@hexagonia/shared";
import { getLocaleName, resolveText, useI18n } from "../../i18n";
import { PopupSelect } from "./PopupSelect";

export function LocaleSelect(props: {
  value: Locale;
  onChange: (locale: Locale) => void;
  ariaLabel: string;
  variant: "landing" | "profile";
  className?: string;
}) {
  const { locale, availableLocales } = useI18n();
  return (
    <PopupSelect
      value={props.value}
      onChange={props.onChange}
      ariaLabel={props.ariaLabel}
      variant={props.variant}
      className={props.className}
      options={availableLocales.map((entry) => {
        const label = resolveText(locale, getLocaleName(entry));
        return {
          value: entry,
          label,
          meta: entry.toUpperCase(),
          triggerLabel: `${label} (${entry.toUpperCase()})`
        };
      })}
    />
  );
}
