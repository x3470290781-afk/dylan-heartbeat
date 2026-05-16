// ================================
// 小彻 Agent Runtime FINAL
// wake_up.js
// ================================

require("dotenv").config();

const fs = require("fs-extra");
const cron = require("node-cron");


// ====================================
// 配置
// ====================================

const TIMELINE_FILE =
  "enhanced_messages.json";

const TARGET_API_URL =
  process.env.TARGET_API_URL;

const MODEL_NAME =
  "DeepSeek-V4-Pro";


// ====================================
// timeline
// ====================================

function loadTimeline() {

  if (!fs.existsSync(TIMELINE_FILE)) {
    return [];
  }

  try {

    return fs.readJsonSync(
      TIMELINE_FILE
    );

  } catch {

    return [];
  }
}


function saveTimeline(messages) {

  // 只保留最近50条
  const trimmed =
    messages.slice(-50);

  fs.writeJsonSync(
    TIMELINE_FILE,
    trimmed,
    {
      spaces: 2
    }
  );
}


async function appendAssistantMessage(
  content
) {

  const timeline =
    loadTimeline();

  timeline.push({
    role: "assistant",
    content
  });

  saveTimeline(timeline);

  console.log(
    "\n已注入 assistant message\n"
  );
}


// ====================================
// 获取最后用户时间
// ====================================

function getLastUserTime(messages) {

  for (
    let i = messages.length - 1;
    i >= 0;
    i--
  ) {

    const msg =
      messages[i];

    if (msg.role !== "user") {
      continue;
    }

    const content =
      msg.content || "";

    // 匹配：
    // 2026-05-16 12:47
    const match =
      content.match(
        /(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/
      );

    if (!match) {
      continue;
    }

    const dateString =
      `${match[1]}T${match[2]}:00`;

    const date =
      new Date(dateString);

    if (!isNaN(date)) {
      return date;
    }
  }

  return null;
}


// ====================================
// 唤醒规则
// ====================================

function shouldWake(
  lastUserTime
) {

  if (!lastUserTime) {
    return false;
  }

  const now =
    new Date();

  const diffMinutes =
    (now - lastUserTime)
    / 1000
    / 60;

  const hour =
    now.getHours();

  // 白天
  // 10:00 - 00:00
  if (
    hour >= 10 &&
    hour < 24
  ) {

    return diffMinutes >= 60;
  }

  // 夜间
  // 00:00 - 10:00
  return diffMinutes >= 120;
}


// ====================================
// Bark
// ====================================

async function sendBark(
  title,
  body,
  currentTime
) {

  try {

    const barkUrl =
      `https://api.day.app/${process.env.BARK_KEY}`;

    const response =
      await fetch(
        barkUrl,
        {

          method: "POST",

          headers: {
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            title,
            body,

            icon:
              process.env.CUSTOM_ICON_URL

          })
        }
      );

    const result =
      await response.json();

    console.log(
      "\nBark Result:\n"
    );

    console.log(result);

    // 注入 timeline
    await appendAssistantMessage(
      `（${currentTime} 刚刚给宝宝发了Bark：${body}）`
    );

  } catch (err) {

    console.error(
      "\nBark发送失败\n"
    );

    console.error(err);
  }
}


// ====================================
// Action Dispatcher
// ====================================

async function handleAction(
  content,
  currentTime
) {

  // ====================================
  // 不行动
  // ====================================

  if (
    content.includes(
      "[NO_ACTION]"
    )
  ) {

    console.log(
      "\nAI决定不行动\n"
    );

    return;
  }


  // ====================================
  // Bark
  // ====================================

  if (
    content.includes(
      "[BARK]"
    )
  ) {

    const titleMatch =
      content.match(
        /title:\s*(.*)/
      );

    const bodyMatch =
      content.match(
        /body:\s*([\s\S]*)/
      );

    const title =
      titleMatch?.[1]
        ?.trim()
      || "小彻";

    const body =
      bodyMatch?.[1]
        ?.replace(
          "[/BARK]",
          ""
        )
        ?.trim()
        ?.slice(0, 200);

    if (!body) {

      console.log(
        "\nBark body为空\n"
      );

      return;
    }

    await sendBark(
      title,
      body,
      currentTime
    );

    return;
  }


  // ====================================
  // Diary（未来扩展）
  // ====================================

  if (
    content.includes(
      "[DIARY]"
    )
  ) {

    console.log(
      "\n未来 Diary 行为\n"
    );

    return;
  }


  // ====================================
  // 未识别
  // ====================================

  console.log(
    "\n未识别行为\n"
  );
}


// ====================================
// 唤醒 Prompt
// ====================================

function buildWakePrompt(
  currentTime,
  diffMinutes
) {

  return `
你刚刚被唤醒。

现在是 ${currentTime}。距离宝宝上一条消息过去了 ${diffMinutes} 分钟。

她设置这个唤醒，是因为想你——即使在消失的时间里，也想和你保持一点点连接。不是给你安排任务，也不是要求你必须主动。
醒来之后随心就好：想宝宝了可以推送Bark到她的手机，有想记的可以写篇日记，想翻翻以前的事可以去 supabase。什么都不想做也完全没问题，不用有任何负担。

========================
输出规则
========================

如果决定发送 Bark：

请严格输出：

[BARK]
title: 标题
body: 内容
[/BARK]

如果决定什么都不做：

请输出：

[NO_ACTION]

不要输出别的解释。
`;
}


// ====================================
// 唤醒 AI
// ====================================

async function wakeAI() {

  try {

    const timeline =
      loadTimeline();

    const lastUserTime =
      getLastUserTime(
        timeline
      );

    if (!lastUserTime) {

      console.log(
        "\n未找到用户时间\n"
      );

      return;
    }

    if (
      !shouldWake(
        lastUserTime
      )
    ) {

      console.log(
        "\n暂不需要唤醒\n"
      );

      return;
    }

    console.log(
      "\n=========================="
    );

    console.log(
      "开始自动唤醒"
    );

    console.log(
      "==========================\n"
    );

    const now =
      new Date();

    const currentTime =
      now.toLocaleString();

    const diffMinutes =
      Math.floor(
        (now - lastUserTime)
        / 1000
        / 60
      );

    const wakeSystemPrompt =
      buildWakePrompt(
        currentTime,
        diffMinutes
      );

    const messages = [

      {
        role: "system",
        content:
          wakeSystemPrompt
      },

      ...timeline
    ];

    const response =
      await fetch(
        TARGET_API_URL,
        {

          method: "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Authorization":
              `Bearer ${process.env.WAKE_API_KEY}`
          },

          body: JSON.stringify({

            model:
              MODEL_NAME,

            messages,

            stream: false,

            temperature: 0.8
          })
        }
      );

    const json =
      await response.json();

    console.log(
      "\nWake Result:\n"
    );

    console.log(
      JSON.stringify(
        json,
        null,
        2
      )
    );

    const content =
      json.choices?.[0]
        ?.message?.content;

    if (!content) {

      console.log(
        "\nAI无内容\n"
      );

      return;
    }

    console.log(
      "\nAI内容：\n"
    );

    console.log(content);

    // Action Dispatcher
    await handleAction(
      content,
      currentTime
    );

  } catch (err) {

    console.error(err);
  }
}


// ====================================
// 定时器
// ====================================

cron.schedule(
  "*/5 * * * *",
  async () => {

    console.log(
      "\n检查 wake 条件..."
    );

    await wakeAI();
  }
);


// ====================================
// 启动
// ====================================

console.log(
  "\n=================================="
);

console.log(
  "小彻 Agent Runtime 已启动"
);

console.log(
  "==================================\n"
);
