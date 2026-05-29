export type DocumentQuestionType = "textArea" | "radio" | "checkBox";

export interface DocumentFillRuleDraft {
  id: string;
  enabled: boolean;
  questionNumber: number;
  type: DocumentQuestionType;
  value: string;
}

export interface DocumentFillRule {
  questionIndex: number;
  type: DocumentQuestionType;
  value: string | number | number[];
}

/** 把 UI 填充规则转换成页面脚本可直接消费的零基题号规则。 */
export function normalizeDocumentFillRules(rules: DocumentFillRuleDraft[]): DocumentFillRule[] {
  return rules
    .filter((rule) => rule.enabled)
    .map((rule) => {
      const questionIndex = normalizeQuestionIndex(rule.questionNumber);
      return {
        questionIndex,
        type: rule.type,
        value: normalizeRuleValue(rule)
      };
    });
}

/** 判断多选项当前状态是否需要点击切换。 */
export function shouldToggleChoiceOption(isSelected: boolean, index: number, targetIndexes: number[]) {
  return isSelected !== targetIndexes.includes(index);
}

/** 把用户输入的一基题号转换成脚本使用的零基下标。 */
function normalizeQuestionIndex(questionNumber: number): number {
  const value = Number(questionNumber);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error("题号必须是正整数");
  }
  return value - 1;
}

/** 按题型把用户输入的填充值转换成脚本需要的数据类型。 */
function normalizeRuleValue(rule: DocumentFillRuleDraft): string | number | number[] {
  if (rule.type === "textArea") {
    return rule.value;
  }

  if (rule.type === "radio") {
    return normalizeOptionIndex(rule.value);
  }

  const indexes = parseCheckboxIndexes(rule.value);
  if (indexes.length === 0) {
    throw new Error("多选至少需要一个选项序号");
  }
  return indexes;
}

/** 解析多选题配置，支持逗号分隔和 JSON 数组两种写法。 */
function parseCheckboxIndexes(value: string): number[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("多选值必须是序号数组");
    }
    return parsed.map((item) => normalizeOptionIndex(String(item)));
  }

  return trimmed.split(",").map((item) => normalizeOptionIndex(item));
}

/** 解析单个选项序号，并拒绝负数和非整数。 */
function normalizeOptionIndex(value: string): number {
  const index = Number(value.trim());
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("选项序号必须是非负整数");
  }
  return index;
}
