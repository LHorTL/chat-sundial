import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSubmitPage } from "./DocumentSubmitPage";

describe("DocumentSubmitPage", () => {
  it("renders the control surface for Tencent Docs submission", () => {
    const markup = renderToStaticMarkup(<DocumentSubmitPage />);

    expect(markup).toContain("腾讯文档地址");
    expect(markup).toContain("开放后填充提交");
    expect(markup).not.toContain("手动测试");
    expect(markup).not.toMatch(/<button[^>]*>[\s\S]*?加载网页[\s\S]*?<\/button>/);
    expect(markup).toContain("输入腾讯文档地址后按 Enter 加载");
    expect(markup).not.toContain("提交日期");
    expect(markup).toContain("文档任务");
    expect(markup).toContain("保存任务");
    expect(markup).toContain("放弃草稿");
    expect(markup).not.toContain("复制任务");
    expect(markup).not.toContain("开发者工具");
    expect(markup).not.toContain("重新开始");
    expect(markup).toContain("填充内容");
    expect(markup).toContain("网页预览");
  });
});
