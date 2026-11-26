import { useEffect, useRef, type ReactNode } from "react";
import {
  Circle,
  CircleDashed,
  CircleDot,
  CircleCheck,
  UserRound,
} from "lucide-react";
import "./theme.css";
export { PropertySelect } from "./PropertySelect";

const logoUrl = new URL("./sync-line-logo.svg", import.meta.url).href;

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Sync Line home">
      <img src={logoUrl} alt="" width="309" height="64" />
    </a>
  );
}

export function StatusIcon({ value }: { value: string }) {
  const Icon =
    value === "Done"
      ? CircleCheck
      : value === "In progress"
        ? CircleDot
        : value === "Backlog"
          ? CircleDashed
          : Circle;
  return (
    <Icon
      size={15}
      className="status-icon"
      data-status={value}
      aria-hidden="true"
    />
  );
}

export function Status({ value }: { value: string }) {
  return (
    <span className="status">
      <StatusIcon value={value} />
      {value}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="person">
      <i aria-hidden="true" data-person={name}>
        {name ? (
          name
            .split(" ")
            .map((word) => word[0])
            .join("")
        ) : (
          <UserRound size={13} />
        )}
      </i>
      {name || "Unassigned"}
    </span>
  );
}

export function ButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a className="button" href={href}>
      {children}
    </a>
  );
}

export function Modal({
  labelledBy,
  className,
  children,
  onDismiss,
}: {
  labelledBy: string;
  className: string;
  children: ReactNode;
  onDismiss: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className={className}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}

export function ComposerDialog({
  children,
  expanded,
  onDismiss,
}: {
  children: ReactNode;
  expanded: boolean;
  onDismiss: () => void;
}) {
  return (
    <Modal
      className={expanded ? "composer expanded" : "composer"}
      labelledBy="editor-title"
      onDismiss={onDismiss}
    >
      {children}
    </Modal>
  );
}
