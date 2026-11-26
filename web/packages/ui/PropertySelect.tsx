import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

const unassigned = "Unassigned";

export function PropertySelect({
  id,
  label,
  value,
  options,
  onChange,
  icon,
  iconOnly = false,
}: {
  id?: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  icon?: (value: string) => ReactNode;
  iconOnly?: boolean;
}) {
  // Radix reserves the empty string for clearing a selection. The issue model
  // uses it as a selectable assignee, so use its display name inside the menu.
  return (
    <Select.Root
      value={value || unassigned}
      onValueChange={(choice) => onChange(choice === unassigned ? "" : choice)}
    >
      <Select.Trigger
        id={id}
        className={iconOnly ? "property property-icon-only" : "property"}
        aria-label={label}
      >
        {icon?.(value)}
        {!iconOnly && (
          <>
            <Select.Value>{value || unassigned}</Select.Value>
            <Select.Icon asChild>
              <ChevronDown size={12} />
            </Select.Icon>
          </>
        )}
      </Select.Trigger>
      <Select.Content
        className="property-menu"
        position="popper"
        align="start"
        sideOffset={5}
        collisionPadding={8}
      >
        <Select.Viewport>
          {options.map((option) => (
            <Select.Item
              className="property-option"
              key={option}
              value={option || unassigned}
            >
              {icon?.(option)}
              <Select.ItemText>{option || unassigned}</Select.ItemText>
              <Select.ItemIndicator className="property-check">
                <Check size={14} />
              </Select.ItemIndicator>
            </Select.Item>
          ))}
        </Select.Viewport>
      </Select.Content>
    </Select.Root>
  );
}
