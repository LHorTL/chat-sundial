import type {
  DocumentRunResult,
  ScannedDocumentQuestion
} from "./documentAutomation";
import type { DocumentQuestionType } from "./documentFillRules";

/** 序列化题目扫描脚本，用于生成填充规则草稿。 */
export function buildDocumentScanScript(): string {
  return `(${documentScanScriptSource})()`;
}

/** 扫描当前填写页题目类型和选项列表。 */
function documentScanScriptSource(): DocumentRunResult {
  const questions: ScannedDocumentQuestion[] = Array.from(document.querySelectorAll(".question-main-content")).map((node, index) => {
    const root = node as HTMLElement;
    const textArea = root.getElementsByTagName("textarea")[0];
    const radioOptions = Array.from(root.querySelectorAll(".form-choice-radio-option"));
    const checkboxOptions = Array.from(root.querySelectorAll(".form-choice-checkbox-option"));
    const titleElement = root.querySelector(".question-title, .question-title-text, .question-main-title");
    const title = (titleElement?.textContent || root.textContent || `第 ${index + 1} 题`).trim().replace(/\s+/g, " ").slice(0, 80);
    const type: DocumentQuestionType = textArea ? "textArea" : radioOptions.length > 0 ? "radio" : "checkBox";
    const optionNodes = type === "radio" ? radioOptions : checkboxOptions;

    return {
      questionNumber: index + 1,
      type,
      title,
      optionCount: optionNodes.length,
      options: optionNodes.map((option) => (option.textContent || "").trim().replace(/\s+/g, " ").slice(0, 80))
    };
  });

  return {
    ok: true,
    message: `扫描到 ${questions.length} 个题目`,
    questions
  };
}
