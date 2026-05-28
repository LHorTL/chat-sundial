import { describe, expect, it } from "vitest";
import { resolveDocumentPageState } from "@/sections/docs/lib/documentPageDetection";

describe("document page detection", () => {
  it("detects creator result pages and asks the user to switch to the fill page", () => {
    const result = resolveDocumentPageState({
      href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/result",
      hash: "#/result",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 0,
      hasSubmitButton: false,
      bodyTextSample: "填写 统计 设置 你已提交62份"
    });

    expect(result).toMatchObject({
      ok: false,
      pageKind: "result"
    });
    expect(result.message).toContain("切换到“填写”");
  });

  it("trusts the actual fill form DOM even when Tencent keeps the result route", () => {
    const result = resolveDocumentPageState({
      href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/result",
      hash: "#/result",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 2,
      hasSubmitButton: true,
      bodyTextSample: "填写 测试输入 提交"
    });

    expect(result).toMatchObject({
      ok: true,
      pageKind: "form",
      message: "当前是填写页，检测到 2 个题目"
    });
  });

  it("detects submitted fill-detail pages that still render question content", () => {
    const result = resolveDocumentPageState({
      href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/fill-detail",
      hash: "#/fill-detail",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 2,
      hasSubmitButton: false,
      bodyTextSample: "测试 分享填写统计设置你已提交63份测试01测试输入再填一份修改我的结果"
    });

    expect(result).toMatchObject({
      ok: false,
      pageKind: "result"
    });
    expect(result.message).toContain("切换到“填写”");
  });

  it("keeps a fill route without a submit button in loading state before judging it as result", () => {
    const result = resolveDocumentPageState({
      href: "https://docs.qq.com/form/page/DRVJjUlVsTkpoaG9K#/fill",
      hash: "#/fill",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 2,
      hasSubmitButton: false,
      bodyTextSample: "测试 分享填写统计设置你已提交63份测试01测试输入"
    });

    expect(result).toMatchObject({
      ok: false,
      pageKind: "loading"
    });
  });

  it("rejects non Tencent form pages", () => {
    const result = resolveDocumentPageState({
      href: "https://example.com/form/page/DRVJjUlVsTkpoaG9K#/fill",
      hash: "#/fill",
      pathname: "/form/page/DRVJjUlVsTkpoaG9K",
      questionCount: 2,
      hasSubmitButton: true,
      bodyTextSample: "填写 测试 提交"
    });

    expect(result).toMatchObject({
      ok: false,
      pageKind: "not-form"
    });
  });
});
