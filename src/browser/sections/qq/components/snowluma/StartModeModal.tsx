import { Icon, Modal } from "@fangxinyan/lumina";
import {
  getSnowLumaStartModeOptions,
  type SnowLumaStartMode,
  type SnowLumaStartModeOption,
  type SnowLumaStatus
} from "../../lib/snowluma";

interface SnowLumaStartModeModalProps {
  open: boolean;
  status: SnowLumaStatus;
  onClose: () => void;
  onChoose: (mode: SnowLumaStartMode) => void;
}

interface SnowLumaStartModeOptionsListProps {
  status: SnowLumaStatus;
  onChoose: (mode: SnowLumaStartMode) => void;
}

interface SnowLumaStartModeOptionButtonProps {
  option: SnowLumaStartModeOption;
  onChoose: (mode: SnowLumaStartMode) => void;
}

/** 渲染启动模式弹窗中的单个可选模式。 */
export function SnowLumaStartModeOptionButton({ option, onChoose }: SnowLumaStartModeOptionButtonProps) {
  const badgeText = option.mode === "hot" ? "推荐" : "先退 QQ";
  const iconName = option.mode === "hot" ? "zap" : "qq";

  return (
    <button
      type="button"
      className="snowluma-start-mode-option"
      disabled={option.disabled}
      onClick={() => onChoose(option.mode)}
    >
      <span className="snowluma-start-mode-option__icon" aria-hidden="true">
        <Icon name={iconName} size={18} />
      </span>
      <span className="snowluma-start-mode-option__content">
        <span className="snowluma-start-mode-option__head">
          <span className="snowluma-start-mode-option__title">{option.label}</span>
          <span className="snowluma-start-mode-option__badge">{badgeText}</span>
        </span>
        <span className="snowluma-start-mode-option__desc">{option.description}</span>
        {option.disabledReason && <span className="snowluma-start-mode-option__reason">{option.disabledReason}</span>}
      </span>
      <span className="snowluma-start-mode-option__arrow" aria-hidden="true">
        <Icon name="chevRight" size={16} />
      </span>
    </button>
  );
}

/** 渲染可复用的启动模式选项列表。 */
export function SnowLumaStartModeOptionsList({ status, onChoose }: SnowLumaStartModeOptionsListProps) {
  const startModeOptions = getSnowLumaStartModeOptions(status);

  return (
    <div className="snowluma-start-mode-list">
      {startModeOptions.map((option) => (
        <SnowLumaStartModeOptionButton
          key={option.mode}
          option={option}
          onChoose={onChoose}
        />
      ))}
    </div>
  );
}

/** 复用的 SnowLuma 启动模式弹窗，供管理页和功能页选择热/冷启动。 */
export function SnowLumaStartModeModal({ open, status, onClose, onChoose }: SnowLumaStartModeModalProps) {
  return (
    <Modal
      open={open}
      title="选择启动模式"
      description="SnowLuma 会作为本地 sidecar 启动，区别只在于是否同时打开 QQ。"
      footer={null}
      width={560}
      className="snowluma-start-mode-modal"
      bodyClassName="snowluma-start-mode-modal__body"
      onClose={onClose}
    >
      <SnowLumaStartModeOptionsList status={status} onChoose={onChoose} />
    </Modal>
  );
}
