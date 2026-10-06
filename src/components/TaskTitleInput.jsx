import React, { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { previewTaskTitle } from "../utils/taskTitle";

export const TaskTitleInput = forwardRef(function TaskTitleInput({ value, onChange, onKeyDown, onBlur, onPointerDown, color, borderColor, palette, isDark }, ref) {
  const overlayRef = useRef(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [hovered, setHovered] = useState(null);
  const tokens = previewTaskTitle(value);
  const highlightColor = isDark ? "#c4b5fd" : "#6d28d9";
  const parts = [];
  let cursor = 0;
  for (const token of tokens) {
    parts.push(value.slice(cursor, token.start));
    parts.push(<span key={token.start} data-title-shortcut data-shortcut-label={token.label} style={{ color: highlightColor, textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "3px" }}>{token.text}</span>);
    cursor = token.end;
  }
  parts.push(value.slice(cursor));

  useLayoutEffect(() => {
    setScrollLeft(ref.current?.scrollLeft || 0);
    setHovered(null);
  }, [value, ref]);

  return (
    <div>
      <div className="relative rounded-md" style={{ backgroundColor: palette.surface }}>
        <div ref={overlayRef} aria-hidden="true" className="pointer-events-none absolute inset-px overflow-hidden rounded-md">
          <div className="typing-preview w-max min-w-full whitespace-pre px-2 py-1 text-base font-semibold md:text-sm" style={{ color, transform: `translateX(-${scrollLeft}px)` }}>{parts}</div>
        </div>
        <input
          ref={ref}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          onPointerDown={onPointerDown}
          onScroll={(event) => setScrollLeft(event.currentTarget.scrollLeft)}
          onMouseMove={(event) => {
            const target = [...overlayRef.current.querySelectorAll("[data-title-shortcut]")].find((span) => {
              const bounds = span.getBoundingClientRect();
              return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
            });
            setHovered(target?.dataset.shortcutLabel || null);
          }}
          onMouseLeave={() => setHovered(null)}
          className="task-title-input relative w-full rounded-md border bg-transparent px-2 py-1 text-base font-semibold md:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black/30"
          style={{ color: "transparent", WebkitTextFillColor: "transparent", caretColor: color, borderColor }}
          enterKeyHint="done"
          spellCheck="false"
          autoComplete="off"
          aria-label="Edit card title"
        />
        {hovered && <div role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 max-w-full rounded-lg border px-2 py-1 text-xs font-normal shadow-lg" style={{ backgroundColor: palette.surface, borderColor: palette.border, color: palette.text }}>{hovered}</div>}
      </div>
      {tokens.length > 0 && <p role="status" className="mt-1 text-xs font-normal" style={{ color: palette.subtext }}>{[...new Set(tokens.map(({ label }) => label))].join(" · ")}</p>}
    </div>
  );
});
