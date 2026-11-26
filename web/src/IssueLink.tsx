import type { ReactNode } from "react";
import { issuePath } from "./workspace";

export function IssueLink({
  id,
  className,
  title,
  children,
}: {
  id: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a
      className={className}
      title={title}
      aria-haspopup="menu"
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown Shift+F10 ContextMenu"
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
