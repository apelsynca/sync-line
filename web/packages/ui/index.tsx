import type { ReactNode } from "react";
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
