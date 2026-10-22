import "./Breakdown.css";
import { useId, type ReactNode } from "react";
import type { Breakdown as BreakdownLines } from "../engine/sheet";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/**
 * A derived number with its breakdown in a tooltip. Focusable, so it shows on
 * keyboard focus as well as hover; `aria-describedby` exposes it to screen readers.
 */
export function Breakdown({ value, lines, children }: { value: ReactNode; lines: BreakdownLines; children?: never }) {
  const id = useId();
  return (
    <span className="breakdown" tabIndex={0} aria-describedby={id} style={{ position: "relative", cursor: "help" }}>
      <strong>{value}</strong>
      <span role="tooltip" id={id} className="breakdown-tip">
        <ul>
          {lines.map((l, i) => (
            <li key={i}>
              {l.source}: {l.label} <span>{signed(l.value)}</span>
            </li>
          ))}
        </ul>
      </span>
    </span>
  );
}
