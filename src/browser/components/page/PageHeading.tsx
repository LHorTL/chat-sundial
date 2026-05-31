import { Typography } from "@fangxinyan/lumina";

interface PageHeadingProps {
  title: string;
  description: string;
}

/** 渲染页面标题区，统一各业务页面的标题和说明样式。 */
export function PageHeading({ title, description }: PageHeadingProps) {
  return (
    <header className="page-heading">
      <Typography.Title level={2}>{title}</Typography.Title>
      <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
    </header>
  );
}
