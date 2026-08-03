"""
Valore Library — batch narration generator (ElevenLabs)

What this does:
  Reads one .txt file per country room from an input folder, sends each
  script to the ElevenLabs text-to-speech API, and saves the result as an
  .mp3 in an output folder ready to drop into the museum's /audio directory.

Setup:
  1. pip install requests
  2. Set your API key as an environment variable (never hardcode it):
       export ELEVENLABS_API_KEY="your-key-here"      (Mac/Linux)
       $env:ELEVENLABS_API_KEY="your-key-here"          (Windows PowerShell)
  3. Put one .txt file per room in the input folder, named after the room:
       scripts/france.txt
       scripts/drc.txt
       scripts/lebanon.txt
     Each file should just contain the narration text for that room.

Usage:
  python generate_museum_audio.py --input scripts --output audio --voice-id NELSON_VOICE_ID

  Run --list-voices first if you don't have your voice ID handy:
  python generate_museum_audio.py --list-voices

  Rooms that already have an .mp3 in --output are skipped on a re-run (e.g.
  after a previous run stopped partway through on an API quota limit) so a
  retry doesn't re-spend credits on rooms already done. Pass --force to
  regenerate every room regardless, e.g. after editing a script's text:
  python generate_museum_audio.py --input scripts --output audio --voice-id NELSON_VOICE_ID --force
"""

import argparse
import os
import sys
from pathlib import Path

import requests

ELEVENLABS_BASE = "https://api.elevenlabs.io/v1"


def get_api_key() -> str:
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        sys.exit(
            "ELEVENLABS_API_KEY environment variable is not set.\n"
            "Set it first, e.g.: export ELEVENLABS_API_KEY=\"your-key-here\""
        )
    return key


def list_voices(api_key: str) -> None:
    resp = requests.get(
        f"{ELEVENLABS_BASE}/voices",
        headers={"xi-api-key": api_key},
        timeout=30,
    )
    resp.raise_for_status()
    voices = resp.json().get("voices", [])
    if not voices:
        print("No voices found on this account.")
        return
    print(f"{'Name':<25} Voice ID")
    print("-" * 55)
    for v in voices:
        print(f"{v['name']:<25} {v['voice_id']}")


def generate_audio(
    api_key: str,
    voice_id: str,
    text: str,
    out_path: Path,
    model_id: str = "eleven_multilingual_v2",
    stability: float = 0.5,
    similarity_boost: float = 0.75,
) -> None:
    resp = requests.post(
        f"{ELEVENLABS_BASE}/text-to-speech/{voice_id}",
        headers={
            "xi-api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "text": text,
            "model_id": model_id,
            "voice_settings": {
                "stability": stability,
                "similarity_boost": similarity_boost,
            },
        },
        timeout=120,
    )
    if resp.status_code != 200:
        raise RuntimeError(
            f"ElevenLabs API error {resp.status_code} for {out_path.stem}: {resp.text}"
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(resp.content)


def main() -> None:
    parser = argparse.ArgumentParser(description="Batch-generate museum narration audio via ElevenLabs")
    parser.add_argument("--input", type=str, help="Folder containing one .txt file per room")
    parser.add_argument("--output", type=str, help="Folder to write generated .mp3 files to")
    parser.add_argument("--voice-id", type=str, help="ElevenLabs voice ID to use for all rooms")
    parser.add_argument("--model-id", type=str, default="eleven_multilingual_v2",
                         help="ElevenLabs model ID (default supports non-English scripts too)")
    parser.add_argument("--list-voices", action="store_true", help="List available voices and exit")
    parser.add_argument("--force", action="store_true",
                         help="Regenerate rooms even if an .mp3 already exists in --output (default: skip them)")
    args = parser.parse_args()

    api_key = get_api_key()

    if args.list_voices:
        list_voices(api_key)
        return

    if not args.input or not args.output or not args.voice_id:
        parser.error("--input, --output, and --voice-id are required unless using --list-voices")

    input_dir = Path(args.input)
    output_dir = Path(args.output)

    txt_files = sorted(input_dir.glob("*.txt"))
    if not txt_files:
        sys.exit(f"No .txt files found in {input_dir}")

    print(f"Found {len(txt_files)} script(s) to generate.\n")

    succeeded, failed, skipped = [], [], []
    for txt_file in txt_files:
        room_name = txt_file.stem
        text = txt_file.read_text(encoding="utf-8").strip()
        if not text:
            print(f"  skip  {room_name} (empty file)")
            continue

        out_path = output_dir / f"{room_name}.mp3"
        # A prior run (e.g. one cut short by an API quota limit) may have
        # already generated this room — re-running the same batch shouldn't
        # re-spend credits on rooms that already succeeded. --force opts
        # back into always regenerating, e.g. after editing a script's text.
        if out_path.exists() and out_path.stat().st_size > 0 and not args.force:
            print(f"  skip  {room_name} (already exists at {out_path}; use --force to regenerate)")
            skipped.append(room_name)
            continue

        print(f"  ...   {room_name} -> {out_path}")
        try:
            generate_audio(api_key, args.voice_id, text, out_path, model_id=args.model_id)
            succeeded.append(room_name)
        except Exception as e:
            print(f"  FAIL  {room_name}: {e}")
            failed.append(room_name)

    print(f"\nDone. {len(succeeded)} succeeded, {len(skipped)} skipped, {len(failed)} failed.")
    if failed:
        print("Failed rooms:", ", ".join(failed))
        sys.exit(1)


if __name__ == "__main__":
    main()
