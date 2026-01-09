import sys
import platform
import os
import traceback
import json
import subprocess
from datetime import datetime

LOG_DIR = os.path.join(os.path.dirname(__file__), 'logs')
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, f'env_check_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')

def write_log(text):
    with open(LOG_FILE, 'w', encoding='utf-8') as f:
        f.write(text)

def capture(cmd):
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, shell=True, timeout=30, universal_newlines=True)
    except Exception as e:
        out = f"Command failed: {cmd}\n{e}\n"
    return out

def main():
    lines = []
    lines.append("ENV CHECK")
    lines.append(f"Timestamp: {datetime.now().isoformat()}")
    lines.append(f"Platform: {platform.platform()}")
    lines.append(f"Python executable: {sys.executable}")
    lines.append(f"Python version: {sys.version}")
    # pip freeze (may be large)
    lines.append("\n--- pip freeze ---")
    lines.append(capture(f'"{sys.executable}" -m pip freeze'))
    # Try import tensorflow
    lines.append("\n--- TensorFlow import test ---")
    try:
        import tensorflow as tf
        lines.append(f"TensorFlow import: SUCCESS, version={getattr(tf, '__version__', 'unknown')}")
    except Exception:
        lines.append("TensorFlow import: FAILED")
        lines.append(traceback.format_exc())

    # Check MSVC redistributable presence by checking common registry keys is complex; skip.
    # Check models folder
    models_dir = os.path.join(os.path.dirname(__file__), 'models')
    lines.append("\n--- Models folder ---")
    lines.append(f"Models dir: {models_dir}")
    if os.path.isdir(models_dir):
        files = os.listdir(models_dir)
        lines.append(f"Files: {files}")
        # Try to load any .h5 models (only if TF import succeeded)
        try:
            import tensorflow as tf
            for fname in files:
                if fname.lower().endswith('.h5') or fname.lower().endswith('.keras'):
                    p = os.path.join(models_dir, fname)
                    lines.append(f"\nAttempting to load model: {p}")
                    try:
                        m = tf.keras.models.load_model(p)
                        lines.append(f"Loaded model {fname} successfully. summary():")
                        try:
                            buf = []
                            m.summary(print_fn=lambda s: buf.append(s))
                            lines.extend(buf[:20])
                        except Exception as e:
                            lines.append(f"Could not print model summary: {e}")
                    except Exception:
                        lines.append("Model load traceback:")
                        lines.append(traceback.format_exc())
        except Exception:
            lines.append("Skipping model load attempts because TensorFlow import failed.")
    else:
        lines.append("Models directory does not exist.")

    # Check health endpoint if service running
    lines.append("\n--- predict_service /health ---")
    try:
        import urllib.request, urllib.error
        url = "http://127.0.0.1:5001/health"
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=10) as resp:
                body = resp.read().decode('utf-8')
                lines.append(f"Health {url} response: {body}")
        except Exception as e:
            lines.append(f"Failed to call {url}: {e}")
    except Exception as e:
        lines.append(f"HTTP check failed: {e}")

    report = "\n".join(lines)
    print(report)
    write_log(report)
    print(f"\nLog written to: {LOG_FILE}")

if __name__ == "__main__":
    main()
