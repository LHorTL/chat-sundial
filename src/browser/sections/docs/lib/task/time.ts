/** 把 Date 转换成日期输入框需要的 YYYY-MM-DD 字符串。 */
export function getDateInputValue(date = new Date()): string {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate())
  ].join("-");
}

/** 把 Date 转换成时间输入框需要的 HH:mm:ss 字符串。 */
export function getTimeInputValue(date = new Date()): string {
  return [
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds())
  ].join(":");
}

/** 解析定时提交目标时间，并拒绝非法日期和时间。 */
export function parseDocumentTargetTime(date: string, time: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    throw new Error("提交日期无效");
  }

  const match = time.trim().match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error("提交时间无效");
  }

  const [, hourText, minuteText, secondText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) {
    throw new Error("提交时间无效");
  }

  const [year, month, day] = date.split("-").map(Number);
  const targetDate = new Date(year, month - 1, day, hour, minute, second);
  if (
    targetDate.getFullYear() !== year ||
    targetDate.getMonth() !== month - 1 ||
    targetDate.getDate() !== day
  ) {
    throw new Error("提交日期无效");
  }

  const target = targetDate.getTime();
  if (!Number.isFinite(target)) {
    throw new Error("提交时间无效");
  }

  return target;
}

/** 校验定时提交不能早于当前时间。 */
export function validateDocumentRunStartTime(
  request: { mode: string; targetEpochMs: number; offsetMs: number },
  nowMs = Date.now()
) {
  if (request.mode !== "scheduled-confirm") {
    return;
  }

  if (request.targetEpochMs + request.offsetMs < nowMs) {
    throw new Error("提交时间不能早于当前时间，请重新选择未来时间");
  }
}

/** 把数字补齐为两位字符串。 */
function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
