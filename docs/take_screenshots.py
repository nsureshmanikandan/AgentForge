"""
Take live screenshots of AgentForge pages using Playwright.
Requires: pip install playwright && python -m playwright install chromium
Run: python docs/take_screenshots.py
"""
from playwright.sync_api import sync_playwright
import os
import time

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screenshots")
os.makedirs(OUT_DIR, exist_ok=True)

BASE_URL = "http://localhost:5174"


def main():
    print("📸 AgentForge — Live Screenshot Capture")
    print("=" * 50)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        page = context.new_page()

        # 1. Login
        print("\n  🔐 Logging in...")
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
        time.sleep(1)
        page.fill('input[type="email"]', "admin@example.com")
        page.fill('input[type="password"]', "admin123")
        page.screenshot(path=os.path.join(OUT_DIR, "00_login.png"))
        print("     ✅ Login page captured")

        page.click('button:has-text("Sign In")')
        time.sleep(3)
        page.wait_for_load_state("networkidle")
        print(f"     Logged in → {page.url}")

        # If still on login, try navigating with token approach
        if "/login" in page.url:
            print("     ⚠️  Still on login, trying direct token injection...")
            # Get token via API
            import requests
            r = requests.post("http://127.0.0.1:8000/api/auth/login",
                              data={"username": "admin@example.com", "password": "admin123"},
                              headers={"Content-Type": "application/x-www-form-urlencoded"})
            if r.status_code == 200:
                token = r.json()["access_token"]
                page.evaluate(f'localStorage.setItem("token", "{token}")')
                page.goto(f"{BASE_URL}/")
                page.wait_for_load_state("networkidle")
                time.sleep(2)
                print(f"     ✅ Token injected, now at: {page.url}")
            else:
                print(f"     ❌ API login failed: {r.status_code} {r.text[:100]}")
                print("     Continuing without auth — pages may show login redirect")

        # 2. Dashboard / Home
        page.screenshot(path=os.path.join(OUT_DIR, "01_dashboard.png"))
        print("     ✅ Dashboard captured")

        # 3. Architect page
        print("\n  🏗️  Navigating to Architect...")
        page.goto(f"{BASE_URL}/architect")
        page.wait_for_load_state("networkidle")
        time.sleep(3)
        page.screenshot(path=os.path.join(OUT_DIR, "02_architect.png"))
        print("     ✅ Architect page captured")

        # 4. Prompt Library
        print("\n  📚 Navigating to Prompt Library...")
        page.goto(f"{BASE_URL}/prompts")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path=os.path.join(OUT_DIR, "03_prompt_library.png"))
        print("     ✅ Prompt Library captured")

        # Scroll down to see more prompts
        page.evaluate("window.scrollTo(0, 600)")
        time.sleep(1)
        page.screenshot(path=os.path.join(OUT_DIR, "03b_prompt_library_scrolled.png"))
        print("     ✅ Prompt Library (scrolled) captured")

        # 5. Published Projects
        print("\n  🌐 Navigating to Published Projects...")
        page.goto(f"{BASE_URL}/published")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path=os.path.join(OUT_DIR, "04_published_projects.png"))
        print("     ✅ Published Projects captured")

        # 6. My Projects
        print("\n  📁 Navigating to My Projects...")
        page.goto(f"{BASE_URL}/projects")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        page.screenshot(path=os.path.join(OUT_DIR, "05_my_projects.png"))
        print("     ✅ My Projects captured")

        # 7. Try to capture Architect with some content (if sessions exist)
        print("\n  🏗️  Architect (with session)...")
        page.goto(f"{BASE_URL}/architect")
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        # Type a prompt to show the chat interface
        textarea = page.locator("textarea, input[placeholder*='Describe'], input[placeholder*='build']").first
        if textarea.count() > 0:
            textarea.fill("Build a customer support chatbot with RAG")
            time.sleep(1)
            page.screenshot(path=os.path.join(OUT_DIR, "06_architect_with_prompt.png"))
            print("     ✅ Architect with prompt captured")

        browser.close()

    print(f"\n✅ All screenshots saved to: {OUT_DIR}")
    print(f"   Files: {os.listdir(OUT_DIR)}")


if __name__ == "__main__":
    main()
