import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { uiHapticsManager } from "../../audio/uiHapticsManager";

export interface PopupSelectOption<Value extends string> {
  value: Value;
  label: string;
  meta?: string;
  triggerLabel?: string;
  disabled?: boolean;
}

export function PopupSelect<Value extends string>(props: {
  value: Value;
  options: ReadonlyArray<PopupSelectOption<Value>>;
  onChange: (value: Value) => void;
  ariaLabel: string;
  variant: "landing" | "profile";
  className?: string;
  disabled?: boolean;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const selectedOption = props.options.find((entry) => entry.value === props.value) ?? props.options[0] ?? null;
  const disabled = props.disabled || props.options.length === 0;

  useEffect(() => {
    if (!open || typeof window === "undefined" || disabled) {
      setMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) {
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(Math.max(rect.width, 12.5 * 16), viewportWidth - 16);
      const estimatedHeight = Math.min(props.options.length, 6) * 48 + 12;
      const spaceBelow = viewportHeight - rect.bottom - 10;
      const spaceAbove = rect.top - 10;
      const openUpward = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
      const maxHeight = Math.max(8 * 16, openUpward ? spaceAbove : spaceBelow);
      const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));

      setMenuStyle({
        position: "fixed",
        insetInlineStart: left,
        insetBlockStart: openUpward ? Math.max(8, rect.top - 6) : Math.min(viewportHeight - 8, rect.bottom + 6),
        inlineSize: width,
        maxBlockSize: maxHeight,
        transform: openUpward ? "translateY(-100%)" : undefined
      });
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    updateMenuPosition();
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [disabled, open, props.options.length]);

  useEffect(() => {
    setOpen(false);
  }, [disabled, selectedOption?.value]);

  return (
    <>
      <div className={`locale-select-shell locale-select-shell-${props.variant} ${props.className ?? ""}`.trim()}>
        <button
          ref={triggerRef}
          type="button"
          data-popup-select-trigger="true"
          className={`locale-select-trigger locale-select-trigger-${props.variant} ${open ? "is-open" : ""}`.trim()}
          aria-label={props.ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              void uiHapticsManager.play("soft");
              setOpen((current) => !current);
            }
          }}
        >
          <span className="locale-select-trigger-copy">{selectedOption?.triggerLabel ?? selectedOption?.label ?? ""}</span>
          <span className="locale-select-trigger-caret" aria-hidden="true" />
        </button>
      </div>
      {open && menuStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              data-popup-select-portal="true"
              className={`locale-select-menu locale-select-menu-${props.variant}`}
              style={menuStyle}
              role="listbox"
              aria-label={props.ariaLabel}
            >
              {props.options.map((entry) => {
                const active = entry.value === selectedOption?.value;

                return (
                  <button
                    key={entry.value}
                    type="button"
                    role="option"
                    className={`locale-select-option locale-select-option-${props.variant} ${active ? "is-active" : ""}`.trim()}
                    aria-selected={active}
                    disabled={entry.disabled}
                    onClick={() => {
                      if (entry.disabled) {
                        return;
                      }

                      void uiHapticsManager.play("soft");
                      props.onChange(entry.value);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                  >
                    <span className="locale-select-option-copy">
                      <span className="locale-select-option-label">{entry.label}</span>
                      {entry.meta ? <span className="locale-select-option-code">{entry.meta}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );
}
