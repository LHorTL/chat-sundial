import { Button, Card, Checkbox, DatePicker, Input, Radio, TimePicker, Typography } from "@fangxinyan/lumina";
import { Field } from "@/components/page";
import type { DocumentFillRuleDraft, DocumentSubmitMode } from "../../lib/runtime/automation";
import type { DocumentSubmitTask } from "../../lib/task/registration";
import { modeOptions, parseDocumentDateValue } from "../../lib/task/viewModel";
import { DocumentBlockingNotice } from "./BlockingNotice";
import { DocumentFillRuleTable } from "../fill-rules/RuleTable";

interface DocumentTaskConfigCardProps {
  task: DocumentSubmitTask;
  isTaskRunning: boolean;
  isScheduledMode: boolean;
  isActiveTaskSaved: boolean;
  canUseElectronView: boolean;
  blockingNotice: { title: string; message: string } | null;
  onPatchTask: (id: string, patch: Partial<DocumentSubmitTask>) => void;
  onLoadDocument: (task: DocumentSubmitTask) => void;
  onScanQuestions: (task: DocumentSubmitTask) => void;
  onAddRule: (task: DocumentSubmitTask) => void;
  onUpdateRule: (taskId: string, ruleId: string, patch: Partial<DocumentFillRuleDraft>) => void;
  onRemoveRule: (task: DocumentSubmitTask, ruleId: string) => void;
  onRecheckPage: (taskId: string) => void;
  onSaveTask: (task: DocumentSubmitTask) => void;
  onRemoveTask: (id: string) => void;
  onUpdateRunningTask: (task: DocumentSubmitTask) => void;
  onStopTask: (task: DocumentSubmitTask) => void;
  onStartTask: (task: DocumentSubmitTask) => void;
}

/** 渲染腾讯文档任务配置卡片，并把所有配置变更回传给页面容器。 */
export function DocumentTaskConfigCard({
  task,
  isTaskRunning,
  isScheduledMode,
  isActiveTaskSaved,
  canUseElectronView,
  blockingNotice,
  onPatchTask,
  onLoadDocument,
  onScanQuestions,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
  onRecheckPage,
  onSaveTask,
  onRemoveTask,
  onUpdateRunningTask,
  onStopTask,
  onStartTask
}: DocumentTaskConfigCardProps) {
  return (
    <Card title="任务配置" bodyLayout="stack" className="document-config-card">
      <div className="document-config-grid">
        <Field label="任务名称">
          <Input value={task.name} onValueChange={(name) => onPatchTask(task.id, { name })} allowClear />
        </Field>
        <Field label="提交模式">
          <Radio.Group
            value={task.mode}
            onChange={(value) => {
              if (isTaskRunning) {
                return;
              }

              onPatchTask(task.id, { mode: value as DocumentSubmitMode });
            }}
            options={modeOptions.map((option) => ({ ...option, disabled: isTaskRunning }))}
            variant="segmented"
            size="sm"
            className={isTaskRunning ? "document-mode-switch is-locked" : "document-mode-switch"}
          />
        </Field>
      </div>

      <Field label="腾讯文档地址">
        <Input
          value={task.url}
          onValueChange={(url) => {
            if (isTaskRunning) {
              return;
            }

            onPatchTask(task.id, { url });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              if (isTaskRunning) {
                return;
              }

              onLoadDocument(task);
            }
          }}
          placeholder="输入腾讯文档地址后自动加载，按 Enter 可立即加载"
          disabled={isTaskRunning}
          allowClear
        />
      </Field>

      {isScheduledMode ? (
        <ScheduledConfirmFields task={task} onPatchTask={onPatchTask} />
      ) : (
        <AwaitFillFields
          task={task}
          canUseElectronView={canUseElectronView}
          onScanQuestions={onScanQuestions}
          onAddRule={onAddRule}
          onUpdateRule={onUpdateRule}
          onRemoveRule={onRemoveRule}
          onPatchTask={onPatchTask}
        />
      )}

      <DocumentBlockingNotice
        notice={blockingNotice}
        canUseElectronView={canUseElectronView}
        onRecheck={() => onRecheckPage(task.id)}
      />

      <div className="document-command-bar">
        {!isActiveTaskSaved && <Button icon="check" onClick={() => onSaveTask(task)}>保存任务</Button>}
        {!isActiveTaskSaved && <Button icon="trash" variant="ghost" onClick={() => onRemoveTask(task.id)}>放弃草稿</Button>}
        {isTaskRunning && <Button icon="sync" onClick={() => onUpdateRunningTask(task)} disabled={!canUseElectronView}>更新运行配置</Button>}
        <Button
          variant={isTaskRunning ? "danger" : "primary"}
          icon={isTaskRunning ? "pause" : "play"}
          onClick={() => isTaskRunning ? onStopTask(task) : onStartTask(task)}
          disabled={!canUseElectronView}
        >
          {isTaskRunning ? "停止任务" : "开始任务"}
        </Button>
      </div>
    </Card>
  );
}

/** 渲染到点确认提交模式下的日期和时间字段。 */
function ScheduledConfirmFields({
  task,
  onPatchTask
}: Pick<DocumentTaskConfigCardProps, "task" | "onPatchTask">) {
  return (
    <div className="document-mode-panel">
      <div className="form-grid">
        <Field label="提交日期">
          <DatePicker
            value={parseDocumentDateValue(task.date)}
            onChange={(_date, dateString) => onPatchTask(task.id, { date: dateString || task.date })}
            format="YYYY-MM-DD"
            allowClear={false}
            popupClassName="document-floating-panel"
          />
        </Field>
        <Field label="提交时间">
          <TimePicker
            value={task.time}
            onChange={(time) => onPatchTask(task.id, { time: time || "00:00:00" })}
            format="HH:mm:ss"
            showSecond
            allowClear={false}
            popupClassName="document-floating-panel"
          />
        </Field>
      </div>
    </div>
  );
}

/** 渲染开放后填充提交模式下的填充规则配置。 */
function AwaitFillFields({
  task,
  canUseElectronView,
  onScanQuestions,
  onAddRule,
  onUpdateRule,
  onRemoveRule,
  onPatchTask
}: Pick<
  DocumentTaskConfigCardProps,
  "task" | "canUseElectronView" | "onScanQuestions" | "onAddRule" | "onUpdateRule" | "onRemoveRule" | "onPatchTask"
>) {
  return (
    <div className="document-mode-panel">
      <div className="document-section-header">
        <Typography.Text strong>填充内容</Typography.Text>
        <div className="document-card-actions">
          <Button size="sm" icon="search" onClick={() => onScanQuestions(task)} disabled={!canUseElectronView}>扫描题目</Button>
          <Button size="sm" icon="plus" onClick={() => onAddRule(task)}>添加</Button>
        </div>
      </div>
      <DocumentFillRuleTable
        task={task}
        onUpdateRule={onUpdateRule}
        onRemoveRule={onRemoveRule}
      />
      <div className="document-submit-options">
        <Checkbox
          checked={task.confirmAfterSubmit}
          onChange={(confirmAfterSubmit) => onPatchTask(task.id, { confirmAfterSubmit })}
          label="提交后点击二次确认"
        />
      </div>
    </div>
  );
}
