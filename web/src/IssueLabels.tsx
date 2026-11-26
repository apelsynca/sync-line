import { useMemo } from "react";
import { Tag } from "lucide-react";
import { PropertySelect } from "@sync-line/ui";
import type { Issue } from "./workspace";

export const labelsMaxLength = 500;

// User label keys are lowercase, so this menu value cannot shadow a label.
const anyLabel = "Any label";

function parseLabels(value: string) {
  const names = new Map<string, string>();
  for (const part of value.split(",")) {
    const label = part.trim();
    const key = label.toLowerCase();
    if (label && !names.has(key)) names.set(key, label);
  }
  return names;
}

export function matchesLabel(value: string, selected?: string) {
  if (selected === undefined) return true;
  const labels = parseLabels(value);
  return selected === "" ? labels.size === 0 : labels.has(selected.toLowerCase());
}

export function IssueLabels({ value }: { value: string }) {
  const names = parseLabels(value);
  if (!names.size) return null;
  return (
    <span className="issue-labels">
      {Array.from(names, ([key, label]) => (
        <span key={key}>{label}</span>
      ))}
    </span>
  );
}

export function IssueLabelFilter({
  issues,
  value,
  onChange,
}: {
  issues: Issue[];
  value?: string;
  onChange: (label?: string) => void;
}) {
  const names = useMemo(() => {
    const labels = parseLabels(issues.map((issue) => issue.labels).join(","));
    // A saved view can outlive the last issue with its label.
    if (value && !labels.has(value.toLowerCase())) {
      labels.set(value.toLowerCase(), value);
    }
    return labels;
  }, [issues, value]);
  const keys = [...names.keys()].sort((a, b) => a.localeCompare(b));
  function formatValue(choice: string) {
    if (choice === anyLabel) return anyLabel;
    if (!choice) return "Unlabeled";
    const name = names.get(choice)!;
    return /^(any label|unlabeled)$/i.test(name) ? `Label “${name}”` : name;
  }
  return (
    <PropertySelect
      label="Filter by label"
      value={value?.toLowerCase() ?? anyLabel}
      options={[anyLabel, "", ...keys]}
      formatValue={formatValue}
      icon={() => <Tag size={15} aria-hidden="true" />}
      onChange={(choice) =>
        onChange(choice === anyLabel ? undefined : names.get(choice) ?? "")
      }
    />
  );
}
