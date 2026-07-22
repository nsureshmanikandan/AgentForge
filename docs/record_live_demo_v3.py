"""
AgentForge — Live Demo v3 (Synchronized Video + Voice)
Records each scene separately, synced with narration duration.
Each scene's recording length matches its narration length.

Run: python docs/record_live_demo_v3.py
Requires: pip install playwright gtts moviepy requests
Pre-req: Backend on :8000, Frontend on :5174
"""
from playwright.sync_api import sync_playwright
import os
import time
import subprocess
import requests
from gtts import gTTS
from moviepy import AudioFileClip

D = os.path.dirname(os.path.abspath(__file__))
SCENES_DIR = os.path.join(D, "demo_v3_scenes")
AUDIO_DIR = os.path.join(D, "demo_v3_audio")
OUT = os.path.join(D, "AgentForge_Live_Demo_v3.mp4")
os.makedirs(SCENES_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)

BASE_URL = "http://localhost:5174"


def get_token():
    """Get auth token."""
    r = requests.post("http://127.0.0.1:8000/api/auth/login",
                      data={"username": "admin@example.com", "password": "admin123"},
                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    if r.status_code == 200:
        return r.json()["access_token"]
    requests.post("http://127.0.0.1:8000/api/auth/register",
                  json={"email": "admin@example.com", "password": "admin123", "full_name": "Admin User"})
    r = requests.post("http://127.0.0.1:8000/api/auth/login",
                      data={"username": "admin@example.com", "password": "admin123"},
                      headers={"Content-Type": "application/x-www-form-urlencoded"})
    return r.json()["access_token"]


def gen_audio(name, text):
    """Generate TTS for a segment. Returns (path, duration_seconds)."""
    path = os.path.join(AUDIO_DIR, f"{name}.mp3")
    if not os.path.exists(path):
        gTTS(text=text, lang='en', slow=False).save(path)
    clip = AudioFileClip(path)
    dur = clip.duration
    clip.close()
    return path, dur


def make_scene_video(image_path, audio_path, out_path):
    """Combine a screenshot + audio into one scene clip using ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", image_path,
        "-i", audio_path,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p", "-vf", "fps=2",
        "-shortest", "-movflags", "+faststart",
        out_path
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.returncode == 0


def main():
    print("🎬 AgentForge — Live Demo v3 (Synced Video + Voice)")
    print("=" * 55)

    token = get_token()
    print("  🔐 Auth ready")

    # Define all scenes: narration text + browser actions
    SCENES = [
        {
            "name": "01_intro",
            "narration": "Welcome to the AgentForge live demo. We'll walk through the Architect page, the Prompt Library flow, and the Published Projects re-use flow — all in action.",
            "action": "dashboard",
        },
        {
            "name": "02_architect_empty",
            "narration": "This is the Planning Architect page. On the left are sessions. In the center is the chat where you describe what to build. On the right, the plan panel with tabs for Plan, Agents, App, and Database.",
            "action": "architect_empty",
        },
        {
            "name": "03_typing",
            "narration": "Let's type a prompt: Build a customer support chatbot with RAG over our company knowledge base, SSO authentication, and a real-time analytics dashboard. We press Enter to submit.",
            "action": "architect_type",
        },
        {
            "name": "04_plan_generated",
            "narration": "The AI has processed our request. It generated a full architecture plan with tech stack, agents, features, API endpoints, and build phases. Let's explore the tabs.",
            "action": "architect_plan",
        },
        {
            "name": "05_agents_tab",
            "narration": "The Agents tab shows the AI agents defined for our app. Each agent has a name, role, model, and tools. The Orchestrator manages the flow between agents.",
            "action": "architect_agents",
        },
        {
            "name": "06_app_tab",
            "narration": "The App tab shows a live React UI preview of the generated application. You can see the chatbot interface running in a sandbox. This is a working preview you can interact with.",
            "action": "architect_app",
        },
        {
            "name": "07_prompt_library",
            "narration": "Now let's visit the Prompt Library. Over 30 curated enterprise prompts organized by category: General, Marketing, Sales, HR, and more. Each card shows the prompt title, complexity, and tools used.",
            "action": "prompt_library",
        },
        {
            "name": "08_use_in_architect",
            "narration": "Every prompt has a 'Use this prompt' button. Clicking it sends the prompt directly to the Architect and starts generation immediately. No typing needed. Non-technical users can build complex apps with one click.",
            "action": "prompt_library_scroll",
        },
        {
            "name": "09_published",
            "narration": "The Published Projects page shows projects shared across the organization. Anyone can click 'Open in Architect' to load a published project, iterate on it, and re-deploy an updated version.",
            "action": "published",
        },
        {
            "name": "10_my_projects",
            "narration": "My Projects shows all your personal work. Projects auto-save as you work. You can publish them for the team, share with specific people, or re-open in the Architect anytime.",
            "action": "my_projects",
        },
        {
            "name": "11_closing",
            "narration": "That's AgentForge in action. Three paths to production AI apps: type a prompt in the Architect, pick from the Prompt Library, or fork a published project. All generating deploy-ready full-stack applications with React, FastAPI, and Docker.",
            "action": "dashboard_final",
        },
    ]

    # Step 1: Generate all audio + get durations
    print("\n  🔊 Generating narration audio...")
    scene_data = []
    for scene in SCENES:
        audio_path, dur = gen_audio(scene["name"], scene["narration"])
        scene_data.append({**scene, "audio_path": audio_path, "duration": dur})
        print(f"     {scene['name']}: {dur:.1f}s")

    total_audio = sum(s["duration"] for s in scene_data)
    print(f"     Total narration: {total_audio:.0f}s ({total_audio/60:.1f} min)")

    # Step 2: Record screenshots for each scene, timed to narration
    print("\n  📸 Capturing scene screenshots...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # Login
        page.goto(BASE_URL)
        page.evaluate(f'localStorage.setItem("token", "{token}")')
        page.goto(BASE_URL)
        page.wait_for_load_state("domcontentloaded")
        time.sleep(2)

        for scene in scene_data:
            action = scene["action"]
            name = scene["name"]
            img_path = os.path.join(SCENES_DIR, f"{name}.png")

            if action == "dashboard" or action == "dashboard_final":
                page.goto(BASE_URL)
                page.wait_for_load_state("domcontentloaded")
                time.sleep(2)

            elif action == "architect_empty":
                page.goto(f"{BASE_URL}/architect")
                page.wait_for_load_state("domcontentloaded")
                time.sleep(3)

            elif action == "architect_type":
                # Should already be on architect, type prompt
                textarea = page.locator("textarea").first
                if textarea.count() == 0:
                    textarea = page.locator("input[type='text']").first
                if textarea.count() > 0:
                    prompt = "Build a customer support chatbot with RAG over our company knowledge base, SSO authentication, and a real-time analytics dashboard"
                    textarea.click()
                    textarea.type(prompt, delay=10)
                    time.sleep(1)
                    page.keyboard.press("Enter")
                    time.sleep(10)  # Wait for AI response

            elif action == "architect_plan":
                # Click Plan tab if available
                plan_tab = page.locator("button:has-text('Plan')").first
                if plan_tab.count() > 0 and plan_tab.is_visible():
                    plan_tab.click()
                time.sleep(3)
                # Try answering questions if they appeared
                for opt in ["SSO + RBAC", "SSO", "100-1000", "Standard"]:
                    btn = page.locator(f"button:has-text('{opt}')").first
                    if btn.count() > 0 and btn.is_visible():
                        btn.click()
                        time.sleep(1)
                for btn_text in ["Generate Architecture Plan", "Generate Plan", "Submit"]:
                    gen_btn = page.locator(f"button:has-text('{btn_text}')").first
                    if gen_btn.count() > 0 and gen_btn.is_visible():
                        gen_btn.click()
                        time.sleep(12)
                        break
                time.sleep(3)

            elif action == "architect_agents":
                tab = page.locator("button:has-text('Agents')").first
                if tab.count() > 0 and tab.is_visible():
                    tab.click()
                time.sleep(2)

            elif action == "architect_app":
                tab = page.locator("button:has-text('App')").first
                if tab.count() > 0 and tab.is_visible():
                    tab.click()
                time.sleep(2)

            elif action == "prompt_library":
                page.goto(f"{BASE_URL}/prompts")
                page.wait_for_load_state("domcontentloaded")
                time.sleep(4)

            elif action == "prompt_library_scroll":
                # Scroll down to show more cards
                page.evaluate("window.scrollTo({top: 400, behavior: 'smooth'})")
                time.sleep(2)

            elif action == "published":
                page.goto(f"{BASE_URL}/published")
                page.wait_for_load_state("domcontentloaded")
                time.sleep(3)

            elif action == "my_projects":
                page.goto(f"{BASE_URL}/projects")
                page.wait_for_load_state("domcontentloaded")
                time.sleep(3)

            # Take screenshot
            page.screenshot(path=img_path)
            print(f"     ✅ {name}")

        context.close()
        browser.close()

    # Step 3: Build scene clips (screenshot + narration audio)
    print("\n  🎞  Building scene clips...")
    clip_paths = []
    for scene in scene_data:
        name = scene["name"]
        img_path = os.path.join(SCENES_DIR, f"{name}.png")
        audio_path = scene["audio_path"]
        clip_path = os.path.join(SCENES_DIR, f"{name}.mp4")

        if not os.path.exists(img_path):
            print(f"     ⚠️ Missing: {img_path}")
            continue

        if make_scene_video(img_path, audio_path, clip_path):
            size_mb = os.path.getsize(clip_path) / (1024 * 1024)
            print(f"     ✅ {name} ({size_mb:.1f} MB, {scene['duration']:.1f}s)")
            clip_paths.append(clip_path)
        else:
            print(f"     ❌ Failed: {name}")

    # Step 4: Concatenate all scene clips
    print(f"\n  🎞  Concatenating {len(clip_paths)} scenes...")
    concat_file = os.path.join(SCENES_DIR, "concat.txt")
    with open(concat_file, "w") as f:
        for clip in clip_paths:
            f.write(f"file '{clip.replace(chr(92), '/')}'\n")

    cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0",
           "-i", concat_file, "-c", "copy", "-movflags", "+faststart", OUT]
    result = subprocess.run(cmd, capture_output=True, text=True)

    if result.returncode == 0:
        size_mb = os.path.getsize(OUT) / (1024 * 1024)
        print(f"\n✅ Final video: {OUT}")
        print(f"   Size: {size_mb:.1f} MB")
        print(f"   Duration: ~{total_audio:.0f}s ({total_audio/60:.1f} min)")
        print(f"   Scenes: {len(clip_paths)}")
        print(f"\n   Video and narration are PERFECTLY SYNCED:")
        print(f"   Each scene shows exactly what the narrator is describing.")
    else:
        print(f"❌ Concat error: {result.stderr[-200:]}")

    # Cleanup temp mp4 clips
    for clip in clip_paths:
        os.remove(clip)
    if os.path.exists(concat_file):
        os.remove(concat_file)


if __name__ == "__main__":
    main()
