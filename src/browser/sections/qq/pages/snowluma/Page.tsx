import { useCallback, useEffect, useState } from "react";
import { Drawer, Modal, Typography } from "@fangxinyan/lumina";
import { PageHeading } from "@/components/page";
import { SnowLumaControlPanel } from "../../components/snowluma/ControlPanel";
import { SnowLumaDownloadPanel } from "../../components/snowluma/DownloadPanel";
import type { SnowLumaManagerState } from "../../hooks/snowluma/useSnowLumaManager";

/** SnowLuma 管理页主内容固定为操控面板，安装维护通过抽屉进入。 */
export const SNOWLUMA_MAIN_PANEL = "control";
/** SnowLuma 安装和版本维护抽屉标题。 */
export const SNOWLUMA_INSTALL_DRAWER_TITLE = "版本与安装";
/** SnowLuma 首次初始化弹窗标题。 */
export const SNOWLUMA_INIT_MODAL_TITLE = "初始化 SnowLuma";

let snowlumaInitPromptShown = false;

interface SnowLumaPageProps {
  snowluma: SnowLumaManagerState;
  selectedAccountUin: string;
  onSelectAccount: (uin: string) => void;
}

/** 编排 SnowLuma 管理页的下载、操控和账号接入流程。 */
export function SnowLumaPage({ snowluma, selectedAccountUin, onSelectAccount }: SnowLumaPageProps) {
  const [installDrawerOpen, setInstallDrawerOpen] = useState(false);
  const [initModalOpen, setInitModalOpen] = useState(false);
  const downloadMessage = snowluma.message?.scope === "download" ? snowluma.message.text : "";
  const controlMessage = snowluma.message?.scope === "control" ? snowluma.message.text : "";

  /** 打开 SnowLuma 版本与安装抽屉。 */
  const openInstallDrawer = useCallback(() => {
    setInstallDrawerOpen(true);
  }, []);

  /** 使用内置包完成首次初始化，并打开抽屉展示过程。 */
  const initializeFromBundled = useCallback(() => {
    setInitModalOpen(false);
    setInstallDrawerOpen(true);
    void snowluma.installBundled();
  }, [snowluma]);

  useEffect(() => {
    if (snowlumaInitPromptShown || snowluma.loading) {
      return;
    }

    if (snowluma.status.installState === "missing" && snowluma.status.bundledVersion) {
      snowlumaInitPromptShown = true;
      setInitModalOpen(true);
    }
  }, [snowluma.loading, snowluma.status.bundledVersion, snowluma.status.installState]);

  return (
    <div className="page">
      <PageHeading
        title="SnowLuma 管理"
        description="下载、启动本地 SnowLuma，并选择一个账号接入当前 OneBot 配置。"
      />

      <SnowLumaControlPanel
        status={snowluma.status}
        accounts={snowluma.accounts}
        loading={snowluma.loading}
        accountsLoading={snowluma.accountsLoading}
        error={snowluma.error}
        message={controlMessage}
        onStart={snowluma.start}
        onStop={snowluma.stop}
        onRestart={snowluma.restart}
        onRefresh={snowluma.refreshStatus}
        onRefreshAccounts={snowluma.refreshAccounts}
        onOpenWebUi={snowluma.openWebUi}
        onOpenQqDownloadUrl={snowluma.openQqDownloadUrl}
        onSelectAccount={onSelectAccount}
        onOpenInstallDrawer={openInstallDrawer}
        selectedAccountUin={selectedAccountUin}
      />

      <Drawer
        open={installDrawerOpen}
        title={SNOWLUMA_INSTALL_DRAWER_TITLE}
        placement="right"
        size={720}
        destroyOnClose={false}
        onClose={() => setInstallDrawerOpen(false)}
      >
        <div className="snowluma-install-drawer">
          <SnowLumaDownloadPanel
            status={snowluma.status}
            loading={snowluma.loading}
            error={snowluma.error}
            message={downloadMessage}
            onInstall={snowluma.installLatest}
            onUninstall={snowluma.uninstall}
            onOpenInstallFolder={snowluma.openInstallFolder}
            onOpenDownloadUrl={snowluma.openDownloadUrl}
            onRefresh={snowluma.refreshStatus}
          />
        </div>
      </Drawer>

      <Modal
        open={initModalOpen}
        title={SNOWLUMA_INIT_MODAL_TITLE}
        description={`检测到还没有安装 SnowLuma，可直接使用内置包 ${snowluma.status.bundledVersion || ""} 完成初始化。`}
        okText="立即初始化"
        cancelText="稍后"
        okButtonProps={{
          variant: "primary",
          loading: snowluma.loading,
          disabled: !snowluma.status.bundledVersion
        }}
        onOk={initializeFromBundled}
        onClose={() => setInitModalOpen(false)}
      >
        <Typography.Text>
          初始化会把应用内置的完整 Windows x64 包解压到用户数据目录，后续更新和普通安装保持一致。
        </Typography.Text>
      </Modal>
    </div>
  );
}
