require("dotenv").config();

const Fastify = require("fastify");
const fs = require("fs-extra");

const app = Fastify({
  logger: true
});

const PORT = 3000;

const TARGET_API_URL =
  process.env.TARGET_API_URL;

const TIMELINE_FILE =
  "enhanced_messages.json";


// ========================
// 读取 timeline
// ========================

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


// ========================
// 保存 timeline
// ========================

function saveTimeline(messages) {

  fs.writeJsonSync(
    TIMELINE_FILE,
    messages,
    {
      spaces: 2
    }
  );
}


// ========================
// 找最后共同 message
// ========================

function findLastCommonIndex(
  oldMessages,
  newMessages
) {

  let lastIndex = -1;

  const minLength = Math.min(
    oldMessages.length,
    newMessages.length
  );

  for (let i = 0; i < minLength; i++) {

    const oldMsg =
      JSON.stringify(oldMessages[i]);

    const newMsg =
      JSON.stringify(newMessages[i]);

    if (oldMsg === newMsg) {

      lastIndex = i;

    } else {

      break;
    }
  }

  return lastIndex;
}


// ========================
// merge timeline
// ========================

function mergeMessages(
  timelineMessages,
  kelivoMessages
) {

  if (
    timelineMessages.length === 0
  ) {

    return kelivoMessages;
  }

  const commonIndex =
    findLastCommonIndex(
      timelineMessages,
      kelivoMessages
    );

  if (commonIndex === -1) {

    return kelivoMessages;
  }

  const extraTimelineMessages =
    timelineMessages.slice(
      commonIndex + 1
    );

  const kelivoNewMessages =
    kelivoMessages.slice(
      commonIndex + 1
    );

  const merged = [

    ...timelineMessages.slice(
      0,
      commonIndex + 1
    ),

    ...extraTimelineMessages,

    ...kelivoNewMessages
  ];

  return merged.slice(-50);
}


// ========================
// append assistant message
// ========================

async function appendAssistantMessage(
  content
) {

  const timeline =
    loadTimeline();

  timeline.push({
    role: "assistant",
    content
  });

  const trimmed =
    timeline.slice(-50);

  saveTimeline(trimmed);

  console.log(
    "\n已追加 assistant message\n"
  );
}


// ========================
// models
// ========================

app.get(
  "/v1/models",
  async (req, reply) => {

    reply.send({
      object: "list",
      data: [
        {
          id: "DeepSeek-V4-Pro",
          object: "model",
          created: 0,
          owned_by: "gateway"
        }
      ]
    });
  }
);


// ========================
// chat completions
// ========================

app.post(
  "/v1/chat/completions",
  async (req, reply) => {

    try {

      const body = req.body;

      console.log(
        "\n============================"
      );

      console.log(
        "收到 Kelivo 请求"
      );

      console.log(
        "============================\n"
      );

      // 原始 messages
      const kelivoMessages =
        body.messages || [];

      // timeline
      const timelineMessages =
        loadTimeline();

      // merge
      const mergedMessages =
        mergeMessages(
          timelineMessages,
          kelivoMessages
        );

      // 替换 messages
      body.messages =
        mergedMessages;

      // 保存 timeline
      saveTimeline(
        mergedMessages
      );

      console.log(
        "\n===== 当前 Timeline =====\n"
      );

      console.log(
        JSON.stringify(
          mergedMessages,
          null,
          2
        )
      );

      // 请求模型
      const response =
        await fetch(
          TARGET_API_URL,
          {

            method: "POST",

            headers: {

              "Content-Type":
                "application/json",

              "Authorization":
                req.headers.authorization || ""
            },

            body: JSON.stringify(body)
          }
        );

      // 设置流式 header
      reply.raw.writeHead(
        response.status,
        {
          "Content-Type":
            "text/event-stream",

          "Cache-Control":
            "no-cache",

          "Connection":
            "keep-alive"
        }
      );

      // 流式转发
      const reader =
        response.body.getReader();

      while (true) {

        const {
          done,
          value
        } = await reader.read();

        if (done) {
          break;
        }

        reply.raw.write(value);
      }

      reply.raw.end();

    } catch (err) {

      console.error(err);

      reply.code(500).send({
        error: err.message
      });
    }
  }
);


// ========================
// test bark
// ========================

app.get(
  "/test-bark",
  async (req, reply) => {

    const time =
      new Date().toLocaleString();

    await appendAssistantMessage(

      `（${time} 刚刚给宝宝发了Bark：怎么还不睡。）`
    );

    reply.send({
      success: true
    });
  }
);


// ========================
// start
// ========================

app.listen({
  port: PORT,
  host: "0.0.0.0"
});
