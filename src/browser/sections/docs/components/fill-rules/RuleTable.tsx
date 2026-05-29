import { Button, Checkbox, Input, InputNumber, Select } from "@fangxinyan/lumina";
import type { DocumentFillRuleDraft, DocumentQuestionType } from "../../lib/runtime/automation";
import type { DocumentSubmitTask } from "../../lib/task/registration";
import { defaultValueForType, placeholderForType, questionTypeOptions } from "../../lib/task/viewModel";

interface DocumentFillRuleTableProps {
  task: DocumentSubmitTask;
  onUpdateRule: (taskId: string, ruleId: string, patch: Partial<DocumentFillRuleDraft>) => void;
  onRemoveRule: (task: DocumentSubmitTask, ruleId: string) => void;
}

/** 渲染文档填充规则表格，并把单元格变更回传给任务容器。 */
export function DocumentFillRuleTable({ task, onUpdateRule, onRemoveRule }: DocumentFillRuleTableProps) {
  return (
    <div className="fill-rule-table-wrap">
      <table className="fill-rule-table">
        <thead>
          <tr>
            <th>启用</th>
            <th>题号</th>
            <th>类型</th>
            <th>值</th>
            <th aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {task.fillRules.map((rule) => (
            <tr key={rule.id}>
              <td>
                <Checkbox checked={rule.enabled} onChange={(enabled) => onUpdateRule(task.id, rule.id, { enabled })} />
              </td>
              <td>
                <InputNumber
                  min={1}
                  value={rule.questionNumber}
                  onChange={(questionNumber) => onUpdateRule(task.id, rule.id, { questionNumber: questionNumber ?? 1 })}
                  controls={false}
                />
              </td>
              <td>
                <Select
                  value={rule.type}
                  onChange={(value) => onUpdateRule(task.id, rule.id, { type: value as DocumentQuestionType, value: defaultValueForType(value as DocumentQuestionType) })}
                  options={questionTypeOptions}
                  popupClassName="document-floating-panel"
                />
              </td>
              <td>
                <Input
                  value={rule.value}
                  onValueChange={(value) => onUpdateRule(task.id, rule.id, { value })}
                  placeholder={placeholderForType(rule.type)}
                  allowClear
                />
              </td>
              <td>
                <Button size="sm" variant="ghost" icon="trash" onClick={() => onRemoveRule(task, rule.id)}>删除</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
