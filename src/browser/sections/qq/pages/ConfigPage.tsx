import { PageHeading } from "@/components/page";
import { OneBotConfigForm } from "../components/OneBotConfigForm";
import type { OneBotConfig, OneBotConnectionStatus } from "../lib/onebot";

interface ConfigPageProps {
  config: OneBotConfig;
  connectionStatus: OneBotConnectionStatus;
  lastError: string;
  onSave: (config: OneBotConfig) => void;
  onTest: (config: OneBotConfig) => void;
}

/** 编排 OneBot 配置页面的标题和连接信息表单。 */
export function ConfigPage({ config, connectionStatus, lastError, onSave, onTest }: ConfigPageProps) {
  return (
    <div className="page">
      <PageHeading
        title="OneBot 配置"
        description="选择本地或远程连接，填写一个入口和访问令牌。"
      />

      <OneBotConfigForm
        config={config}
        connectionStatus={connectionStatus}
        lastError={lastError}
        onSave={onSave}
        onTest={onTest}
      />
    </div>
  );
}
