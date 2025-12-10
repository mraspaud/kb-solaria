import subprocess
import sys
import time
import os
import webbrowser

def run_dev(config_file):
    """Run Hybrid Mode (Vite + Python API with HMR)."""
    # 1. Install JS dependencies if missing
    if not os.path.exists("node_modules"):
        print("📦 [Frontend] Installing dependencies...")
        subprocess.check_call(["npm install"], shell=True)
    
    print(f"🔌 [System] Starting Hybrid Dev Mode (Config: {config_file})...")
    
    # 2. Start Vite (Non-blocking)
    # This serves the frontend at localhost:5173
    frontend = subprocess.Popen(["npm run dev"], shell=True)
    
    # 3. Start Python Backend with Auto-Reload (Blocking)
    try:
        time.sleep(1) # Give Vite a moment to start
        print("\n🐍 [Backend] Starting API Server on port 4722 with HMR...")
       
        print("🚀 [System] Opening Solaria...")
        webbrowser.open("http://localhost:5173")

        subprocess.check_call([
            sys.executable, "-m", "watchfiles", 
            f"{sys.executable} run.py {config_file}", # Command to restart
            "kbunified",  # Watch the submodule source
            "run.py"    # Watch the entry point
        ])
    except KeyboardInterrupt:
        pass
    finally:
        print("\n🛑 Shutting down...")
        frontend.terminate()
        frontend.wait()
