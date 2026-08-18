const key = process.env.OPENAI_API_KEY;
const base = process.env.OPENAI_BASE_URL ?? "https://router.cheap/v1";
const models = process.argv.slice(2);

for (const model of models) {
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Скажи одно слово: привет" }],
        max_tokens: 20,
      }),
    });
    const text = await res.text();
    console.log(`${model} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
  } catch (cause) {
    console.log(`${model} -> EXCEPTION: ${String(cause)}`);
  }
}
