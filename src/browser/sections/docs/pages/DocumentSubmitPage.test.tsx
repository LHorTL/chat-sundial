import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentSubmitPage, isDocumentUrlLocked, shouldLoadConfiguredDocument } from "./DocumentSubmitPage";

describe("DocumentSubmitPage", () => {
  it("renders the control surface for Tencent Docs submission", () => {
    const markup = renderToStaticMarkup(<DocumentSubmitPage />);

    expect(markup).toContain("腾讯文档地址");
    expect(markup).toContain("开放后填充提交");
    expect(markup).not.toContain("手动测试");
    expect(markup).not.toMatch(/<button[^>]*>[\s\S]*?加载网页[\s\S]*?<\/button>/);
    expect(markup).toContain("输入腾讯文档地址后自动加载，按 Enter 可立即加载");
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

  it("locks the document URL input while the task is running", () => {
    expect(isDocumentUrlLocked("running")).toBe(true);
    expect(isDocumentUrlLocked("loading")).toBe(false);
    expect(isDocumentUrlLocked("stopped")).toBe(false);
  });

  it("requires loading the configured Tencent document when the current webview points to another document", () => {
    expect(shouldLoadConfiguredDocument(
      "https://docs.qq.com/form/page/DRVOLD#/fill",
      "https://docs.qq.com/form/page/DRVNEW#/fill"
    )).toBe(true);

    expect(shouldLoadConfiguredDocument(
      "https://docs.qq.com/form/page/DRVNEW#/result",
      "https://docs.qq.com/form/page/DRVNEW#/fill"
    )).toBe(false);
  });
});
