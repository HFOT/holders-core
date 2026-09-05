/* 質問する道具。
 *
 * 提案で約束したことと、完了報告で報告されたことを AI に渡す。
 * こちらからは何も指示しない。何を聞くかは読む人が決める。
 *
 * 「評価して」「判定して」に類する指示をこのファイルに書かない。
 * 渡すのは、A と B がそれぞれ何であるかの説明だけである。
 *
 * 答えは保存しない。これは読む人の道具であって、サイトの記録ではない。
 * 鍵はこの端末の中だけに置く。聞く先以外のどこにも送らない。
 */

const ASK_KEY_STORE = "holders_core_ask_key";

/* AI に渡す前置き。2つの文章が何であるかを述べるだけ。指示は含めない。 */
const ASK_CONTEXT =
  "以下は、ある事業の記録です。\n" +
  "A は、提案時に「これをやる」と書かれていたこと。\n" +
  "B は、その事業の完了報告に「これをやった」と書かれていたことです。";

const ASK_PROVIDERS = {
  groq: {
    label: "Groq（無料）",
    url: "https://api.groq.com/openai/v1/chat/completions",
    model: "llama-3.3-70b-versatile",
    free: true,
    hint: "console.groq.com で無料の鍵が取れる（クレジットカード不要）",
    site: "https://console.groq.com/keys",
  },
  openai: {
    label: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
    hint: "platform.openai.com（有料）",
    site: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    label: "Claude",
    url: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-4-20250514",
    hint: "console.anthropic.com（有料）",
    site: "https://console.anthropic.com/settings/keys",
  },
};

const askStore = {
  read() {
    try {
      return JSON.parse(localStorage.getItem(ASK_KEY_STORE) || "{}");
    } catch (e) {
      return {};
    }
  },
  write(v) {
    try {
      localStorage.setItem(ASK_KEY_STORE, JSON.stringify(v));
    } catch (e) {
      /* 保存できない設定なら、その回だけ使う */
    }
  },
  clear() {
    try {
      localStorage.removeItem(ASK_KEY_STORE);
    } catch (e) {
      /* 消せなくても進む */
    }
  },
};

/* 問い合わせ。提供元ごとに形が違うのでここで吸収する。 */
async function askProvider(provider, key, text) {
  const p = ASK_PROVIDERS[provider];
  if (!p) throw new Error("知らない提供元");

  const isAnthropic = provider === "anthropic";
  const headers = { "Content-Type": "application/json" };
  if (isAnthropic) {
    headers["x-api-key"] = key;
    headers["anthropic-version"] = "2023-06-01";
    headers["anthropic-dangerous-direct-browser-access"] = "true";
  } else {
    headers.Authorization = `Bearer ${key}`;
  }

  const res = await fetch(p.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: p.model,
      max_tokens: 1200,
      messages: [{ role: "user", content: text }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status} ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  if (isAnthropic) {
    return (data.content || []).map((c) => c.text || "").join("");
  }
  const choice = (data.choices || [])[0] || {};
  return (choice.message || {}).content || "";
}

/* A と B を組み立てる。原文をそのまま渡す。訳は渡さない。
   question は読む人が書いた問い。これが無ければ聞くこと自体が成り立たない。 */
function askBuildText(ms, question) {
  const a = [ms.promise, ms.criteria].filter(Boolean).join("\n\n");
  const b = ms.report || "";
  return (
    ASK_CONTEXT +
    "\n\n--- A（提案で約束したこと）---\n" +
    a +
    "\n\n--- B（完了報告で報告されたこと）---\n" +
    b +
    "\n\n--- 質問 ---\n" +
    question
  );
}
