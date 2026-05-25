import { describe, expect, it } from "vitest";
import {
  buildOneBotActionRequest,
  buildSendMessageAction,
  isCountdownDue,
  matchMonitorEvent,
  normalizeOneBotConfig,
  parseOneBotGroupList
} from "./onebot";

describe("onebot helpers", () => {
  it("builds HTTP action requests with normalized base URL and bearer token", () => {
    const config = normalizeOneBotConfig({
      httpUrl: "http://127.0.0.1:5700/",
      accessToken: "secret"
    });

    expect(buildOneBotActionRequest(config, "get_status", {}).url).toBe("http://127.0.0.1:5700/get_status");
    expect(buildOneBotActionRequest(config, "get_status", {}).headers.Authorization).toBe("Bearer secret");
  });

  it("maps group and private recipients to OneBot send actions", () => {
    expect(
      buildSendMessageAction({
        recipientType: "group",
        targetId: "10001",
        message: "群消息"
      })
    ).toEqual({
      action: "send_group_msg",
      params: {
        group_id: 10001,
        message: "群消息",
        auto_escape: false
      }
    });

    expect(
      buildSendMessageAction({
        recipientType: "private",
        targetId: "20002",
        message: "私聊消息"
      })
    ).toMatchObject({
      action: "send_private_msg",
      params: {
        user_id: 20002,
        message: "私聊消息"
      }
    });
  });

  it("detects countdown task due time", () => {
    expect(isCountdownDue({ mode: "countdown", seconds: 30, startedAt: 1_000 }, 31_000)).toBe(true);
    expect(isCountdownDue({ mode: "schedule", runAt: "2026-05-25T10:00:00.000Z" }, Date.parse("2026-05-25T09:59:59.000Z"))).toBe(false);
    expect(isCountdownDue({ mode: "schedule", runAt: "2026-05-25T10:00:00.000Z" }, Date.parse("2026-05-25T10:00:00.000Z"))).toBe(true);
  });

  it("matches regex group messages and mute state notices", () => {
    expect(
      matchMonitorEvent(
        {
          trigger: "regex",
          sourceGroupId: "12345",
          pattern: "开服|开门"
        },
        { post_type: "message", message_type: "group", group_id: 12345, raw_message: "今晚八点开服" }
      )
    ).toBe(true);

    expect(
      matchMonitorEvent(
        {
          trigger: "mute_on",
          sourceGroupId: "12345"
        },
        { post_type: "notice", notice_type: "group_ban", group_id: 12345, duration: 600 }
      )
    ).toBe(true);

    expect(
      matchMonitorEvent(
        {
          trigger: "mute_off",
          sourceGroupId: "12345"
        },
        { post_type: "notice", notice_type: "group_ban", group_id: 12345, duration: 0 }
      )
    ).toBe(true);
  });

  it("normalizes OneBot group list data for searchable group selectors", () => {
    expect(
      parseOneBotGroupList([
        { group_id: 10001, group_name: "攻略讨论", member_count: 32, max_member_count: 200 },
        { group_id: "10002", group_name: "", member_count: 8 },
        { group_name: "缺少 ID" }
      ])
    ).toEqual([
      { groupId: "10001", groupName: "攻略讨论", memberCount: 32, maxMemberCount: 200 },
      { groupId: "10002", groupName: "群聊 10002", memberCount: 8, maxMemberCount: undefined }
    ]);
  });
});
