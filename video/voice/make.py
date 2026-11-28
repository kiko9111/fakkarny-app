# Writes video/voice/out/<lang>-<id>.mp3 for every line in lines.json (edge-tts).
import asyncio, json, os, edge_tts
here = os.path.dirname(__file__); cfg = json.load(open(os.path.join(here, "lines.json"), encoding="utf-8"))
out = os.path.join(here, "out"); os.makedirs(out, exist_ok=True)
async def main():
    for line in cfg["lines"]:
        for key, voice in cfg["voices"].items():
            text = line["en" if key == "en" else "ar"]
            await edge_tts.Communicate(text, voice, rate="+4%").save(os.path.join(out, f"{key}-{line['id']}.mp3"))
            print(key, line["id"])
asyncio.run(main())
