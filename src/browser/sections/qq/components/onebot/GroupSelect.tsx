import { useMemo, useRef, useState, type SyntheticEvent } from "react";
import { Select } from "@fangxinyan/lumina";
import type { SelectOption } from "@fangxinyan/lumina";
import type { OneBotGroupInfo } from "../../lib/onebot";

type GroupSelectOption = SelectOption<string> & {
  searchText: string;
};

interface GroupIdSelectProps {
  value: string;
  onChange: (value: string) => void;
  groups: OneBotGroupInfo[];
  loading?: boolean;
  error?: string;
  placeholder?: string;
}

export function GroupIdSelect({
  value,
  onChange,
  groups,
  loading = false,
  error = "",
  placeholder = "搜索群名或群号"
}: GroupIdSelectProps) {
  const [open, setOpen] = useState(false);
  const suppressOpenUntilRef = useRef(0);
  const options = useMemo(
    () =>
      groups.map((group) => ({
        value: group.groupId,
        label: <GroupOptionLabel group={group} />,
        searchText: `${group.groupName} ${group.groupId}`
      })),
    [groups]
  ) satisfies GroupSelectOption[];

  const keepClearClickOnButton = (event: SyntheticEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest(".select-clear")) {
      return;
    }

    suppressOpenUntilRef.current = window.performance.now() + 200;
    event.stopPropagation();
  };

  const handleClear = () => {
    suppressOpenUntilRef.current = window.performance.now() + 200;
    setOpen(false);
    onChange("");
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen && window.performance.now() < suppressOpenUntilRef.current) {
      setOpen(false);
      return;
    }

    setOpen(nextOpen);
  };

  return (
    <Select
      key={value || "empty"}
      value={value || undefined}
      onChange={(nextValue) => onChange(String(nextValue ?? ""))}
      open={open}
      onOpenChange={handleOpenChange}
      onClear={handleClear}
      onPointerDownCapture={keepClearClickOnButton}
      onMouseDownCapture={keepClearClickOnButton}
      options={options}
      allowClear
      showSearch
      filterOption={filterGroupOption}
      emptyContent={groupEmptyText(loading, error)}
      loading={loading}
      placeholder={placeholder}
    />
  );
}

function GroupOptionLabel({ group }: { group: OneBotGroupInfo }) {
  return (
    <span className="group-option">
      <span className="group-option__name">{group.groupName}</span>
      <span className="group-option__id">{group.groupId}</span>
    </span>
  );
}

function filterGroupOption(input: string, option: SelectOption<string>) {
  const keyword = input.trim().toLowerCase();
  if (!keyword) {
    return true;
  }

  const searchText = (option as GroupSelectOption).searchText ?? `${option.value} ${String(option.label ?? "")}`;
  return searchText.toLowerCase().includes(keyword);
}

function groupEmptyText(loading: boolean, error: string) {
  if (loading) {
    return "正在获取群聊...";
  }

  if (error) {
    return `群列表获取失败：${error}`;
  }

  return "暂无群聊，请先确认 OneBot 连接";
}
