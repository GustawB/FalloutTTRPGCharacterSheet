import "./Breakdown.css";
import { useId } from "react";
import type { Perk, Requirement, Trait } from "../engine/rules";

function describeRequirement(r: Requirement): string {
  switch (r.kind) {
    case "ability":
      return r.min !== undefined && r.max !== undefined ? `${r.ability} ${r.min}–${r.max}`
        : r.min !== undefined ? `${r.ability} ${r.min}+` : `${r.ability} ${r.max} or less`;
    case "anyAbility": return `an ability score of ${r.max} or less`;
    case "race": return `race ${r.anyOf.join(" or ")}`;
    case "level": return `level ${r.min}+`;
    case "condition": return r.text;
  }
}

export function repeatText(entry: Perk | Trait): string {
  if (entry.kind !== "perk" || !entry.repeat) return "Can be taken once";
  const { max, scope, text } = entry.repeat;
  const limit = max === null || max === undefined ? "no fixed limit" : `up to ${max}`;
  return `Repeatable (${limit}${scope === "party" ? ", whole party" : ""}): ${text}`;
}

/** A perk or trait name that shows its description, requirements, repeat rule and page on hover or focus. */
export function EntryTooltip({ entry }: { entry: Perk | Trait }) {
  const id = useId();
  const requirements = entry.requirementText ?? (entry.requirements.length ? entry.requirements.map(describeRequirement).join(", ") : "None");
  return (
    <span className="breakdown" tabIndex={0} aria-describedby={id} style={{ position: "relative", cursor: "help" }}>
      <strong>{entry.name}</strong>
      <span role="tooltip" id={id} className="breakdown-tip">
        <p>{entry.description}</p>
        <p>Requirements: {requirements}</p>
        <p>{repeatText(entry)}</p>
        <p>Page {entry.source.page}</p>
      </span>
    </span>
  );
}
