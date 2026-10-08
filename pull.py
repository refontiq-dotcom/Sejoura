import subprocess
try:
    print("Running git pull...")
    result = subprocess.run(["git", "pull", "origin", "main"], cwd="/home/dukoua/Projets/Séjoura", capture_output=True, text=True)
    print("STDOUT:", result.stdout)
    print("STDERR:", result.stderr)
except Exception as e:
    print("Error:", e)
