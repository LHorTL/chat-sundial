import type { ReactNode } from "react";
import { Typography } from "@fangxinyan/lumina";

interface PageHeadingProps {
  title: string;
  description: string;
  actions?: ReactNode;
}

/** 渲染页面标题区，统一各业务页面的标题和说明样式。 */
export function PageHeading({ title, description, actions }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <div className="page-heading__main">
        <Typography.Title level={2}>{title}</Typography.Title>
        <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
      </div>
      {actions && <div className="page-heading__actions">{actions}</div>}
    </header>
  );
}
