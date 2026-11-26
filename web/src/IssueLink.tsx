import type { ReactNode } from "react";
import { issuePath } from "./workspace";

export function IssueLink({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      className={className}
      href={issuePath(id)}
      draggable={false}
      onClick={(event) => {
        const selection = window.getSelection();
        if (
          event.detail > 0 &&
          selection &&
          !selection.isCollapsed &&
          event.currentTarget.contains(selection.anchorNode)
        )
          event.preventDefault();
      }}
    >
      {children}
    </a>
  );
}
