import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  children: ReactNode;
  asLabel?: boolean;
}

/** 渲染表单字段容器，可按控件需要选择 div 或 label 语义。 */
export function Field({ label, children, asLabel = false }: FieldProps) {
  const Component = asLabel ? "label" : "div";

  return (
    <Component className="field">
      <span>{label}</span>
      {children}
    </Component>
  );
}
