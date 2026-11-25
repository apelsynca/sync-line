import { useEffect, useRef, type ReactNode } from "react";
import "./theme.css";

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Sync Line home">
      <span aria-hidden="true" className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      Sync Line
    </a>
  );
}

export function Status({ value }: { value: string }) {
  return (
    <span className="status">
      <i aria-hidden="true" data-status={value} />
      {value}
    </span>
  );
}

export function Avatar({ name }: { name: string }) {
  return (
    <span className="person">
      <i aria-hidden="true" data-person={name}>
        {name
          ? name
              .split(" ")
              .map((word) => word[0])
              .join("")
          : "–"}
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

export function ComposerDialog({
  children,
  onDismiss,
}: {
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
      className="composer"
      aria-labelledby="editor-title"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      {children}
    </dialog>
  );
}
