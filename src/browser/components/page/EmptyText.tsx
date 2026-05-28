import type { ReactNode } from "react";

interface EmptyTextProps {
  children: ReactNode;
}

/** 渲染列表或面板中的空状态文本。 */
export function EmptyText({ children }: EmptyTextProps) {
  return <div className="empty-text">{children}</div>;
}
