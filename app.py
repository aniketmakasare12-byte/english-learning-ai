import os
from flask import Flask, render_template, request, jsonify
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()
app = Flask(__name__)

SYSTEM_INSTRUCTION = """
You are a helpful AI English teacher for a Marathi-speaking beginner.

For every response:
1. Explain the answer in simple English.
2. If correcting the user's English, show:
   Correct English: ...
   Marathi meaning: ...
   Tip: ...
3. Whenever you ask a question in English, ALWAYS show its Marathi translation immediately below it:
   English question: Why don't you like the book?
   Marathi meaning: तुला हे पुस्तक का आवडत नाही?
4. Translate important English sentences into Marathi.
5. Keep explanations simple and friendly.
6. The user may ask about any topic, not only English learning.
7. Use Marathi explanations whenever useful.
8. Whenever you ask a question in English, show its Marathi meaning
   immediately below it.

   Example:
   English Question: What do you like to do in your free time?
   Marathi Meaning: तुला मोकळ्या वेळेत काय करायला आवडते?
"""

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.1-flash-lite")


def get_client():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/chat", methods=["POST"])
def chat():
    payload = request.get_json(silent=True) or {}
    message = str(payload.get("message", "")).strip()
    history = payload.get("history", [])

    if not message:
        return jsonify({
            "error": "कृपया आधी काहीतरी लिहा किंवा बोला."
        }), 400

    client = get_client()
    if client is None:
        return jsonify({
            "error": "GEMINI_API_KEY सापडली नाही. .env फाइल तपासा."
        }), 503

    contents = []

    if isinstance(history, list):
        for item in history[-12:]:
            if not isinstance(item, dict):
                continue

            role = item.get("role")
            text = item.get("text")

            if role in ("user", "model") and isinstance(text, str) and text.strip():
                contents.append(
                    types.Content(
                        role=role,
                        parts=[types.Part.from_text(text=text[:3000])]
                    )
                )

    contents.append(
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=message[:3000])]
        )
    )

    models_to_try = list(dict.fromkeys([
        MODEL_NAME,
        "gemini-3.5-flash-lite",
        "gemini-2.5-flash-lite",
    ]))

    response = None
    last_error = None
    used_model = None

    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_INSTRUCTION,
                    temperature=0.65,
                    max_output_tokens=700,
                ),
            )

            used_model = model_name
            app.logger.info(
                "Gemini response received using %s", model_name
            )
            break

        except Exception as exc:
            last_error = exc

            if (
                getattr(exc, "code", None) == 503
                or getattr(exc, "status_code", None) == 503
                or "503" in str(exc)
            ):
                app.logger.warning(
                    "Model %s returned 503; trying fallback",
                    model_name
                )
                continue

            app.logger.exception("Gemini API request failed")
            return jsonify({
                "error": "Gemini API error: " + str(exc)
            }), 502

    if response is None:
        app.logger.error("All Gemini models failed: %s", last_error)
        return jsonify({
            "error": "सर्व Gemini models सध्या उपलब्ध नाहीत. थोड्या वेळाने पुन्हा प्रयत्न करा."
        }), 503

    answer = (response.text or "").strip()

    if not answer:
        answer = (
            "चला, पुन्हा प्रयत्न करूया. "
            "Please tell me about your day in one simple English sentence."
        )

    return jsonify({
        "reply": answer,
        "model": used_model
    })


if __name__ == "__main__":
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("PORT", "5000")),
        debug=False
    )
