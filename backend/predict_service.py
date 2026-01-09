import io
import os
import sys
import logging
from flask import Flask, request, jsonify, send_file, render_template_string
from flask_cors import CORS
from PIL import Image, UnidentifiedImageError
import numpy as np
import requests
import time
from urllib.parse import urlparse
from datetime import datetime
import json
import base64
from io import BytesIO
import random
from datetime import timedelta

app = Flask(__name__)
CORS(app)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# AUTO-DETECT TensorFlow (no hardcoded fallback)
try:
    import tensorflow
    TF_AVAILABLE = True
    TF_IMPORT_ERROR = None
    logging.info("=" * 70)
    logging.info("✓ TensorFlow AVAILABLE - Attempting to load models")
    logging.info("=" * 70)
except ImportError as e:
    TF_AVAILABLE = False
    TF_IMPORT_ERROR = str(e)
    logging.info("=" * 70)
    logging.info("FALLBACK MODE ENABLED (no TensorFlow)")
    logging.info("=" * 70)
    logging.info("Service will use heuristic predictions based on color analysis.")
    logging.info("To enable TensorFlow: use Python 3.10 or 3.11 with Visual C++ Redistributable")
    logging.info("Install: pip install tensorflow-cpu==2.19.0")
    logging.info("=" * 70)

plastic_model = None
oil_model = None

# Model paths (adjust names if different)
PLASTIC_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'plastic_detection_model.h5')
OIL_MODEL_PATH = os.path.join(os.path.dirname(__file__), 'models', 'oil_spill_detection_model.h5')

# Configurable thresholds via environment variables
TARGET_SIZE = tuple(int(x) for x in os.environ.get('PRED_TARGET_SIZE', '224,224').split(','))
PLASTIC_THRESHOLD = float(os.environ.get('PRED_PLASTIC_THRESHOLD', 0.25))
OIL_THRESHOLD = float(os.environ.get('PRED_OIL_THRESHOLD', 0.35))
NONE_THRESHOLD = float(os.environ.get('PRED_NONE_THRESHOLD', 0.15))
CONFIDENCE_THRESHOLD = float(os.environ.get('PRED_CONFIDENCE_THRESHOLD', 0.35))  # ← LOWERED from 0.60 to 0.35

def load_models():
    global plastic_model, oil_model, TF_AVAILABLE, TF_IMPORT_ERROR
    # ENABLE TensorFlow models
    if not TF_AVAILABLE:
        logging.warning("❌ TensorFlow not available, skipping model load.")
        return
    try:
        logging.info("=" * 70)
        logging.info("ATTEMPTING TO LOAD MODELS...")
        logging.info("=" * 70)
        
        # Verify paths exist before trying to load
        plastic_exists = os.path.exists(PLASTIC_MODEL_PATH)
        oil_exists = os.path.exists(OIL_MODEL_PATH)
        
        logging.info("Plastic model path: %s", PLASTIC_MODEL_PATH)
        logging.info("Plastic model exists: %s", plastic_exists)
        logging.info("Oil model path: %s", OIL_MODEL_PATH)
        logging.info("Oil model exists: %s", oil_exists)
        
        if not plastic_exists or not oil_exists:
            logging.error("❌ ONE OR MORE MODEL FILES NOT FOUND!")
            return
        
        import tensorflow as _tf
        logging.info("Loading plastic model from: %s", PLASTIC_MODEL_PATH)
        plastic_model = _tf.keras.models.load_model(PLASTIC_MODEL_PATH)
        logging.info("✓ Plastic model loaded successfully.")
        
        logging.info("Loading oil model from: %s", OIL_MODEL_PATH)
        oil_model = _tf.keras.models.load_model(OIL_MODEL_PATH)
        logging.info("✓ Oil model loaded successfully.")
        
        logging.info("=" * 70)
        logging.info("✓✓✓ BOTH MODELS LOADED SUCCESSFULLY! ✓✓✓")
        logging.info("=" * 70)
    except Exception as e:
        TF_IMPORT_ERROR = str(e)
        TF_AVAILABLE = False
        logging.error("=" * 70)
        logging.error("❌ FAILED TO LOAD MODELS!")
        logging.error("=" * 70)
        logging.exception("Full error traceback:")

load_models()

def preprocess_pil_image(img: Image.Image, target_size=TARGET_SIZE):
    """Preprocess image to model input format."""
    img = img.convert('RGB').resize(target_size)
    arr = np.array(img, dtype=np.float32) / 255.0
    arr = np.expand_dims(arr, axis=0)
    return arr

def clamp_prob(v):
    """Clamp probability to [0, 1]."""
    try:
        v = float(v)
    except Exception:
        return 0.0
    return float(max(0.0, min(1.0, v)))

def calculate_confidence_score(p_plastic, p_oil, is_water_like=False):
    """
    Calculate a confidence score based on prediction spread and water detection.
    Higher score = more confident in the prediction.
    """
    p = clamp_prob(p_plastic)
    o = clamp_prob(p_oil)
    
    # Base confidence from probability magnitude
    max_prob = max(p, o)
    
    # Penalty if predictions are too close (ambiguous)
    spread = abs(p - o)
    spread_factor = 1.0 + (spread * 0.5)  # Wider spread = more confident
    
    # Penalty if water detected (less certain about classification)
    water_penalty = 0.7 if is_water_like else 1.0
    
    confidence = max_prob * spread_factor * water_penalty
    return min(1.0, max(0.0, confidence))

def decide_label_sequential(p_plastic, p_oil, is_water_like=False):
    """
    SEQUENTIAL DECISION LOGIC with confidence scoring:
    **PRIORITY 0: If water detected, ALWAYS return undetected**
    1. HIGH plastic (>= PLASTIC_THRESHOLD) → "plastic"
    2. ELSE HIGH oil (>= OIL_THRESHOLD) → "oil_spill"
    3. ELSE VERY WEAK signal (max < NONE_THRESHOLD) → "undetected" 
    4. ELSE WEAK signal (max >= NONE_THRESHOLD) → pick higher (weak detection)
    """
    p = clamp_prob(p_plastic)
    o = clamp_prob(p_oil)
    max_prob = max(p, o)
    conf = calculate_confidence_score(p, o, is_water_like)
    
    logging.info("Decision: plastic=%.4f (thr=%.2f), oil=%.4f (thr=%.2f), none_thr=%.2f, max=%.4f, is_water=%s, confidence=%.4f",
                 p, PLASTIC_THRESHOLD, o, OIL_THRESHOLD, NONE_THRESHOLD, max_prob, is_water_like, conf)

    # **PRIORITY 0: WATER ALWAYS WINS - If water detected, undetected**
    if is_water_like:
        reason = "Water detected - classified as undetected (no pollution)"
        logging.info("→ UNDETECTED (water detection overrides all)")
        return 'undetected', reason, conf

    # STEP 1: Strong plastic detection (PRIMARY)
    if p >= PLASTIC_THRESHOLD:
        reason = f"Strong plastic detection (prob={p:.4f})"
        logging.info("→ PLASTIC (primary detector triggered)")
        return 'plastic', reason, conf

    # STEP 2: Strong oil detection (SECONDARY, only if plastic < threshold)
    if o >= OIL_THRESHOLD:
        reason = f"Strong oil spill detection (prob={o:.4f})"
        logging.info("→ OIL_SPILL (secondary detector triggered, plastic was %.4f)", p)
        return 'oil_spill', reason, conf

    # STEP 3: No clear signal → undetected
    if max_prob < NONE_THRESHOLD:
        reason = f"Insufficient signal for classification (plastic={p:.4f}, oil={o:.4f})"
        logging.info("→ UNDETECTED (both probabilities below none_threshold)")
        return 'undetected', reason, conf

    # STEP 4: Weak signal (pick higher)
    if p >= o:
        reason = f"Weak plastic signal (prob={p:.4f}, oil={o:.4f})"
        logging.info("→ PLASTIC (weak signal, plastic > oil)")
        return 'plastic', reason, conf
    else:
        reason = f"Weak oil signal (prob={o:.4f}, plastic={p:.4f})"
        logging.info("→ OIL_SPILL (weak signal, oil > plastic)")
        return 'oil_spill', reason, conf

def decide_label_with_confidence(p_plastic, p_oil):
    """
    Decision logic WITH confidence thresholding.
    If max confidence < CONFIDENCE_THRESHOLD → UNDETECTED (reject uncertain predictions)
    """
    p = clamp_prob(p_plastic)
    o = clamp_prob(p_oil)
    max_prob = max(p, o)
    
    logging.info("CONFIDENCE CHECK: plastic=%.4f (conf_thr=%.2f), oil=%.4f, max=%.4f",
                 p, CONFIDENCE_THRESHOLD, o, max_prob)
    
    # **PRIORITY 1: If max confidence is TOO LOW → UNDETECTED (not oil/plastic)**
    if max_prob < CONFIDENCE_THRESHOLD:
        reason = f"Low confidence prediction (max={max_prob:.4f} < threshold={CONFIDENCE_THRESHOLD})"
        logging.info("→ UNDETECTED (confidence too low - likely clean water or unclear)")
        return 'undetected', reason, max_prob
    
    # **PRIORITY 2: Only classify if CONFIDENT enough**
    if p >= PLASTIC_THRESHOLD:
        reason = f"Strong plastic detection (prob={p:.4f}, confidence={max_prob:.4f})"
        logging.info("→ PLASTIC (confident)")
        return 'plastic', reason, max_prob

    if o >= OIL_THRESHOLD:
        reason = f"Strong oil spill detection (prob={o:.4f}, confidence={max_prob:.4f})"
        logging.info("→ OIL_SPILL (confident)")
        return 'oil_spill', reason, max_prob

    # **PRIORITY 3: Ambiguous signal**
    if max_prob < NONE_THRESHOLD:
        reason = f"Insufficient signal for classification (plastic={p:.4f}, oil={o:.4f})"
        logging.info("→ UNDETECTED (both probabilities very low)")
        return 'undetected', reason, max_prob

    # **PRIORITY 4: Weak but classified**
    if p >= o:
        reason = f"Weak plastic signal (prob={p:.4f}, confidence={max_prob:.4f})"
        logging.info("→ PLASTIC (weak but above threshold)")
        return 'plastic', reason, max_prob
    else:
        reason = f"Weak oil signal (prob={o:.4f}, confidence={max_prob:.4f})"
        logging.info("→ OIL_SPILL (weak but above threshold)")
        return 'oil_spill', reason, max_prob

def fallback_predict_from_pil(img: Image.Image):
    """Use TensorFlow models if available, otherwise use heuristic."""
    
    # ============ STEP 1: WATER DETECTION FIRST ============
    small = img.convert('RGB').resize((128, 128))
    arr = np.array(small, dtype=np.float32) / 255.0
    
    mean_brightness = float(arr.mean())
    r_mean = float(arr[:, :, 0].mean())
    g_mean = float(arr[:, :, 1].mean())
    b_mean = float(arr[:, :, 2].mean())
    
    logging.info("=" * 70)
    logging.info("IMAGE ANALYSIS:")
    logging.info("  RGB Means: R=%.3f, G=%.3f, B=%.3f", r_mean, g_mean, b_mean)
    logging.info("  Brightness: %.3f", mean_brightness)
    
    # Calculate ratios
    total = r_mean + g_mean + b_mean + 1e-6
    blue_ratio = b_mean / total
    green_ratio = g_mean / total
    red_ratio = r_mean / total
    
    logging.info("  Ratios: R=%.3f, G=%.3f, B=%.3f", red_ratio, green_ratio, blue_ratio)
    
    # ✓✓✓ WATER DETECTION - Multiple conditions ✓✓✓
    is_water_like = False
    water_reason = ""
    
    # Condition 1: Blue dominant water (ocean, sea)
    if b_mean > r_mean and b_mean > g_mean * 0.9 and r_mean < 0.35:
        is_water_like = True
        water_reason = "Blue dominant (ocean/sea water)"
    
    # Condition 2: Blue-green water (tropical, pool)
    elif b_mean > 0.25 and g_mean > 0.25 and r_mean < 0.3 and (b_mean + g_mean) > r_mean * 2:
        is_water_like = True
        water_reason = "Blue-green water (tropical/pool)"
    
    # Condition 3: Dark blue water
    elif b_mean > r_mean * 1.3 and b_mean > g_mean and mean_brightness < 0.5 and r_mean < 0.25:
        is_water_like = True
        water_reason = "Dark blue water"
    
    # Condition 4: Light blue/cyan water
    elif blue_ratio > 0.38 and red_ratio < 0.28 and mean_brightness > 0.4:
        is_water_like = True
        water_reason = "Light blue/cyan water"
    
    logging.info("  Water Detection: %s (%s)", is_water_like, water_reason if is_water_like else "Not water")
    logging.info("=" * 70)
    
    # ✓✓✓ IF WATER: RETURN IMMEDIATELY ✓✓✓
    if is_water_like:
        logging.info(">>> WATER DETECTED - Returning 'undetected' (no pollution)")
        meta = {
            "model": "water_detection",
            "is_water_like": True,
            "reason": water_reason,
            "rgb": {"r": round(r_mean, 3), "g": round(g_mean, 3), "b": round(b_mean, 3)}
        }
        return 0.0, 0.0, 'undetected', meta
    
    # ============ STEP 2: NOT WATER - RUN ML MODELS ============
    logging.info("Not water - Running ML models...")
    
    if TF_AVAILABLE and plastic_model is not None and oil_model is not None:
        try:
            x = preprocess_pil_image(img, target_size=(224, 224))
            
            p_raw = plastic_model.predict(x, verbose=0)
            o_raw = oil_model.predict(x, verbose=0)
            
            p_plastic = float(np.asarray(p_raw).flatten()[0])
            p_oil = float(np.asarray(o_raw).flatten()[0])
            
            logging.info("MODEL PREDICTIONS:")
            logging.info("  Plastic prob: %.4f (threshold: %.2f)", p_plastic, PLASTIC_THRESHOLD)
            logging.info("  Oil prob: %.4f (threshold: %.2f)", p_oil, OIL_THRESHOLD)
            
            # Determine label based on thresholds
            if p_plastic >= PLASTIC_THRESHOLD and p_plastic > p_oil:
                label = 'plastic'
                logging.info(">>> RESULT: PLASTIC (plastic=%.4f > oil=%.4f)", p_plastic, p_oil)
            elif p_oil >= OIL_THRESHOLD and p_oil > p_plastic:
                label = 'oil_spill'
                logging.info(">>> RESULT: OIL_SPILL (oil=%.4f > plastic=%.4f)", p_oil, p_plastic)
            elif p_plastic >= PLASTIC_THRESHOLD:
                label = 'plastic'
                logging.info(">>> RESULT: PLASTIC (above threshold)")
            elif p_oil >= OIL_THRESHOLD:
                label = 'oil_spill'
                logging.info(">>> RESULT: OIL_SPILL (above threshold)")
            elif max(p_plastic, p_oil) < NONE_THRESHOLD:
                label = 'undetected'
                logging.info(">>> RESULT: UNDETECTED (both below none_threshold)")
            else:
                # Pick higher one if both below threshold but above none_threshold
                label = 'plastic' if p_plastic >= p_oil else 'oil_spill'
                logging.info(">>> RESULT: %s (weak signal, picked higher)", label.upper())
            
            meta = {
                "model": "tensorflow",
                "plastic_raw": round(p_plastic, 4),
                "oil_raw": round(p_oil, 4),
                "is_water_like": False
            }
            
            return p_plastic, p_oil, label, meta
            
        except Exception as e:
            logging.error("Model prediction failed: %s", e)
            logging.info("Falling back to heuristic...")
    
    # ============ STEP 3: FALLBACK HEURISTIC ============
    logging.info("Using heuristic prediction...")
    
    # Dark images → likely oil
    darkness = 1.0 - mean_brightness
    # Red/brown → likely plastic
    redness = max(0, r_mean - max(g_mean, b_mean)) * 3
    
    p_plastic = clamp_prob(redness * 0.8 + mean_brightness * 0.2)
    p_oil = clamp_prob(darkness * 0.7 + (1 - blue_ratio) * 0.3)
    
    logging.info("HEURISTIC:")
    logging.info("  Darkness: %.3f, Redness: %.3f", darkness, redness)
    logging.info("  Plastic score: %.4f, Oil score: %.4f", p_plastic, p_oil)
    
    if p_plastic >= PLASTIC_THRESHOLD and p_plastic > p_oil:
        label = 'plastic'
    elif p_oil >= OIL_THRESHOLD:
        label = 'oil_spill'
    elif max(p_plastic, p_oil) < NONE_THRESHOLD:
        label = 'undetected'
    else:
        label = 'plastic' if p_plastic >= p_oil else 'oil_spill'
    
    logging.info(">>> HEURISTIC RESULT: %s", label.upper())
    
    meta = {
        "model": "heuristic",
        "darkness": round(darkness, 4),
        "redness": round(redness, 4),
        "plastic_raw": round(p_plastic, 4),
        "oil_raw": round(p_oil, 4),
        "is_water_like": False
    }
    
    return p_plastic, p_oil, label, meta

# after TF_IMPORT_ERROR writing to tf_import_error.log, provide fix metadata
MSVC_REDIST_URL = "https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist"
# Recommended Python/TensorFlow commands (PowerShell friendly)
TF_INSTALL_POWERSHELL = r"""
# Run in an elevated PowerShell or adjust as needed.
# 1) Install Microsoft Visual C++ Redistributable (x64) from:
#    {msvc}
# 2) Create Python 3.10 venv and install tensorflow-cpu
py -3.10 -m venv .\tf-env-backend
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned -Force
& '.\tf-env-backend\Scripts\Activate.ps1'
python -m pip install --upgrade pip
python -m pip install tensorflow-cpu==2.19.0 pillow numpy flask flask-cors requests
""".strip().format(msvc=MSVC_REDIST_URL)

# Add new route to return fix instructions and the short PowerShell script
@app.route('/tf_fix', methods=['GET'])
def tf_fix_instructions():
    """
    Return actionable instructions and a PowerShell snippet to install the MSVC redistributable
    and create a Python 3.10 venv with tensorflow-cpu. Use only as guidance; review before running.
    """
    info = {
        "msvc_redist_url": MSVC_REDIST_URL,
        "notes": [
            "Install the Microsoft Visual C++ Redistributable (x64) and then create a Python 3.10 venv.",
            "Activate the venv and run: python -m pip install --upgrade pip",
            "Then install: python -m pip install tensorflow-cpu==2.19.0"
        ],
        "powershell_snippet": TF_INSTALL_POWERSHELL
    }
    return jsonify(info), 200

@app.route('/health', methods=['GET'])
def health():
    """
    Returns service health and TensorFlow availability.
    """
    if TF_AVAILABLE and plastic_model is not None and oil_model is not None:
        return jsonify({
            "status": "ok",
            "tensorflow": True,
            "models_loaded": True,
            "message": "✓ Service ready. Both models loaded.",
            "plastic_threshold": PLASTIC_THRESHOLD,
            "oil_threshold": OIL_THRESHOLD,
            "none_threshold": NONE_THRESHOLD
        }), 200
    else:
        detail = TF_IMPORT_ERROR or "TensorFlow not available or models not loaded."
        extra_advice = []
        if TF_IMPORT_ERROR and ("DLL load failed" in TF_IMPORT_ERROR or "_pywrap_tensorflow_internal" in TF_IMPORT_ERROR):
            extra_advice.append("DLL load error detected — likely missing Microsoft Visual C++ Redistributable (x64).")
            extra_advice.append(f"Download: {MSVC_REDIST_URL}")
        else:
            extra_advice.append("Check that tensorflow-cpu is installed: pip install tensorflow-cpu==2.19.0")
        extra_advice.append("Check model files exist at: " + PLASTIC_MODEL_PATH)

        return jsonify({
            "status": "degraded",
            "tensorflow": False,
            "models_loaded": False,
            "message": "Service running but TF/models unavailable. Using fallback heuristic.",
            "details": detail,
            "advice": extra_advice
        }), 200

CACHE_DIR = os.path.join(os.path.dirname(__file__), 'cache_images')
os.makedirs(CACHE_DIR, exist_ok=True)

def _cache_path_for_key(key: str):
    import hashlib
    h = hashlib.sha256(key.encode('utf-8')).hexdigest()
    return os.path.join(CACHE_DIR, f"{h}.bin")

def _is_cache_fresh(path, max_age_seconds=24*3600):
    try:
        mtime = os.path.getmtime(path)
        return (time.time() - mtime) < max_age_seconds
    except Exception:
        return False

def fetch_image_with_retries(image_url, forward_headers=None, timeout=15, max_attempts_per_candidate=3):
    """Robust fetch with retries and IPFS gateway fallbacks."""
    headers = {'User-Agent': 'marine-db-fetcher/1.0', 'Accept': 'image/*'}
    if forward_headers:
        headers.update(forward_headers)

    def try_get(url, to=timeout):
        last_exc = None
        backoff = 0.5
        for attempt in range(1, max_attempts_per_candidate+1):
            try:
                resp = requests.get(url, headers=headers, timeout=to)
                if resp.status_code == 200:
                    content_type = resp.headers.get('Content-Type', None)
                    return resp.content, content_type
                if resp.status_code == 429:
                    logging.warning("Rate limited (429) from %s", url)
                    last_exc = RuntimeError(f"429 from {url}")
                else:
                    logging.warning("Non-200 response %s from %s", resp.status_code, url)
                    last_exc = RuntimeError(f"{resp.status_code} from {url}")
            except Exception as e:
                logging.warning("Fetch error for %s: %s", url, e)
                last_exc = e
            time.sleep(backoff)
            backoff = min(backoff * 2, 3.0)
        raise last_exc or RuntimeError("Failed to fetch")

    # Try original URL first
    try:
        content, ctype = try_get(image_url, timeout)
        return content, ctype
    except Exception as e:
        logging.debug("Primary fetch failed for %s: %s", image_url, e)

    # Build IPFS gateway fallbacks
    candidates = []
    parsed = urlparse(image_url or "")
    if image_url and '/ipfs/' in image_url:
        try:
            cid = image_url.split('/ipfs/')[1].split('/')[0]
            candidates = [
                f"https://ipfs.io/ipfs/{cid}",
                f"https://cloudflare-ipfs.com/ipfs/{cid}",
                f"https://dweb.link/ipfs/{cid}",
                f"https://gateway.pinata.cloud/ipfs/{cid}",
                f"https://infura-ipfs.io/ipfs/{cid}"
            ]
        except Exception:
            candidates = [image_url]
    else:
        maybe_cid = None
        if parsed.scheme == '' and image_url and len(image_url) in (46, 59):
            maybe_cid = image_url
        if maybe_cid:
            candidates = [
                f"https://ipfs.io/ipfs/{maybe_cid}",
                f"https://cloudflare-ipfs.com/ipfs/{maybe_cid}",
                f"https://dweb.link/ipfs/{maybe_cid}",
                f"https://gateway.pinata.cloud/ipfs/{maybe_cid}"
            ]
        else:
            candidates = [
                image_url,
                image_url.replace('gateway.pinata.cloud', 'ipfs.io'),
                image_url.replace('gateway.pinata.cloud', 'cloudflare-ipfs.com'),
                image_url.replace('gateway.pinata.cloud', 'dweb.link')
            ]

    for cand in candidates:
        if not cand:
            continue
        try:
            content, ctype = try_get(cand, timeout)
            logging.info("Fetched image from candidate %s", cand)
            return content, ctype
        except Exception as e:
            logging.debug("Candidate %s failed: %s", cand, e)
            continue

    try:
        resp = requests.get(image_url, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.content, resp.headers.get('Content-Type')
    except Exception as e:
        raise RuntimeError(f"Failed to fetch image from URL after retries: {e}")

@app.route('/api/reports/<report_id>/image', methods=['GET'])
def report_image_proxy(report_id):
    """Proxy endpoint to fetch and serve report image with caching."""
    image_url = request.args.get('image_url')
    cid = request.args.get('cid')

    if not image_url and not cid:
        return jsonify({"error": "Provide image_url or cid query parameter"}), 400

    key = image_url if image_url else cid
    cache_path = _cache_path_for_key(key)

    # Serve from cache if fresh
    if os.path.exists(cache_path) and _is_cache_fresh(cache_path, max_age_seconds=24*3600):
        try:
            meta_path = cache_path + ".meta"
            ctype = None
            if os.path.exists(meta_path):
                try:
                    with open(meta_path, 'r', encoding='utf-8') as mf:
                        ctype = mf.read().strip()
                except Exception:
                    ctype = None
            logging.info("Serving report %s image from cache", report_id)
            return send_file(cache_path, mimetype=ctype or 'application/octet-stream')
        except Exception:
            logging.exception("Failed to serve cached image, will refetch")

    # Determine fetch URL
    fetch_url = image_url
    if not fetch_url and cid:
        # Validate CID format (should be ~46 or ~59 chars)
        if len(cid) in (46, 59):
            fetch_url = f"https://ipfs.io/ipfs/{cid}"
            logging.info("Report %s: Constructed IPFS URL from CID: %s", report_id, fetch_url)
        else:
            logging.error("Report %s: Invalid CID format (len=%d, expected 46 or 59)", report_id, len(cid))
            return jsonify({"error": "Invalid CID format"}), 400

    if not fetch_url:
        return jsonify({"error": "Could not determine fetch URL from image_url or cid"}), 400

    logging.info("Report %s: Attempting to fetch image from: %s", report_id, fetch_url)

    try:
        content, ctype = fetch_image_with_retries(fetch_url, forward_headers=None, timeout=15)
        logging.info("Report %s: Successfully fetched image (%d bytes)", report_id, len(content))
    except Exception as e:
        logging.exception("Report %s: Failed to fetch image from %s: %s", report_id, fetch_url, e)
        return jsonify({"error": "Failed to fetch image", "details": str(e), "url": fetch_url}), 502

    # Write to cache
    try:
        with open(cache_path, 'wb') as f:
            f.write(content)
        if ctype:
            with open(cache_path + ".meta", 'w', encoding='utf-8') as mf:
                mf.write(ctype)
        logging.info("Report %s: Cached image (%d bytes)", report_id, len(content))
    except Exception:
        logging.exception("Report %s: Failed to write image cache", report_id)

    return send_file(io.BytesIO(content), mimetype=ctype or 'application/octet-stream')

@app.route('/api/ipfs/test', methods=['POST'])
def ipfs_test():
    """Diagnostic endpoint to test IPFS gateway connectivity and CID resolution."""
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": f"Invalid JSON: {e}"}), 400

    cid = data.get('cid')
    if not cid:
        return jsonify({"error": "Missing 'cid' in request body"}), 400

    logging.info("IPFS Test: Testing CID %s", cid)
    
    results = {
        "cid": cid,
        "cid_valid": len(cid) in (46, 59),
        "gateways_tested": []
    }

    gateways = [
        f"https://ipfs.io/ipfs/{cid}",
        f"https://cloudflare-ipfs.com/ipfs/{cid}",
        f"https://dweb.link/ipfs/{cid}",
        f"https://gateway.pinata.cloud/ipfs/{cid}",
    ]

    for gateway_url in gateways:
        try:
            resp = requests.get(gateway_url, timeout=10)
            results["gateways_tested"].append({
                "url": gateway_url,
                "status": resp.status_code,
                "content_length": len(resp.content),
                "content_type": resp.headers.get('Content-Type'),
                "success": resp.status_code == 200
            })
            logging.info("  %s: %s (%d bytes)", gateway_url, resp.status_code, len(resp.content))
        except Exception as e:
            results["gateways_tested"].append({
                "url": gateway_url,
                "error": str(e),
                "success": False
            })
            logging.warning("  %s: FAILED - %s", gateway_url, e)

    return jsonify(results), 200

@app.route('/api/analytics/summary', methods=['GET'])
def analytics_summary():
    """Get prediction statistics and analytics."""
    preds = load_predictions()
    
    if not preds:
        return jsonify({
            "total_predictions": 0,
            "breakdown": {},
            "message": "No predictions recorded yet"
        }), 200
    
    breakdown = {"plastic": 0, "oil_spill": 0, "undetected": 0}
    for pred_data in preds.values():
        label = pred_data.get("predicted_label", "unknown")
        if label in breakdown:
            breakdown[label] += 1
    
    return jsonify({
        "total_predictions": len(preds),
        "breakdown": breakdown,
        "percentages": {
            k: round((v / len(preds) * 100), 1) for k, v in breakdown.items()
        }
    }, 200)

@app.route('/api/config', methods=['GET'])
def get_config():
    """Get current service configuration."""
    return jsonify({
        "tensorflow_available": TF_AVAILABLE,
        "models_loaded": plastic_model is not None and oil_model is not None,
        "target_size": TARGET_SIZE,
        "thresholds": {
            "plastic": PLASTIC_THRESHOLD,
            "oil_spill": OIL_THRESHOLD,
            "none": NONE_THRESHOLD
        },
        "cache_directory": CACHE_DIR,
        "predictions_file": PREDICTIONS_FILE
    }), 200

def is_pure_water_only(img: Image.Image) -> bool:
    """
    STRICT water detection - returns True ONLY for pure water images.
    This is the absolute first check before any ML models.
    """
    import colorsys
    small = img.convert('RGB').resize((128, 128))
    arr = np.array(small, dtype=np.float32) / 255.0
    
    mean_brightness = float(arr.mean())
    r_mean = float(arr[:, :, 0].mean())
    g_mean = float(arr[:, :, 1].mean())
    b_mean = float(arr[:, :, 2].mean())
    
    sample = arr.reshape(-1, 3)
    sats = []
    for pix in sample:
        hsv = colorsys.rgb_to_hsv(float(pix[0]), float(pix[1]), float(pix[2]))
        sats.append(hsv[1])
    mean_sat = float(np.mean(sats)) if sats else 0.0
    
    denom = (r_mean + g_mean + b_mean) if (r_mean + g_mean + b_mean) > 1e-6 else 1e-6
    blue_green_ratio = (b_mean + g_mean) / (denom / 3.0) if denom > 0 else 0.0
    red_to_blue_ratio = r_mean / (b_mean + 1e-6)
    
    # STRICT: Must pass ALL checks to be considered water
    is_water = (
        b_mean > 0.2 and                    # Decent blue content
        blue_green_ratio > 1.1 and          # Blue+Green dominant
        red_to_blue_ratio < 0.8 and         # RED is LOW (critical!)
        mean_sat < 0.4 and                  # Low color saturation
        mean_brightness > 0.15              # Not completely black
    )
    
    logging.debug("is_pure_water_only check: water=%s (b=%.3f, bgr=%.3f, rbr=%.3f, sat=%.3f, bright=%.3f)",
                  is_water, b_mean, blue_green_ratio, red_to_blue_ratio, mean_sat, mean_brightness)
    return is_water

@app.route('/predict', methods=['POST'])
def predict():
    """Predict from uploaded image."""
    if 'image' not in request.files:
        return jsonify({"error": "No image file part 'image' provided"}), 400

    file = request.files['image']
    try:
        img = Image.open(io.BytesIO(file.read()))
    except Exception as e:
        return jsonify({"error": f"Invalid image: {e}"}), 400

    logging.info("=" * 60)
    logging.info("PREDICT: Processing image")
    p_plastic, p_oil, predicted_label, meta = fallback_predict_from_pil(img)
    
    logging.info("RESULT: label=%s, plastic=%.4f, oil=%.4f", predicted_label, p_plastic, p_oil)
    logging.info("=" * 60)
    
    # Map label to proper category for UI
    category_map = {
        'plastic': 'Plastic',
        'oil_spill': 'Oil Spill',
        'undetected': 'No Detection'
    }
    
    return jsonify({
        "plastic_prob": round(p_plastic, 4),
        "oil_prob": round(p_oil, 4),
        "predicted_label": predicted_label,
        "category": category_map.get(predicted_label, "No Detection"),
        "is_water_detection": meta.get('is_water_like', False),
        "confidence": 0.95 if predicted_label == 'undetected' and meta.get('is_water_like') else round(max(p_plastic, p_oil), 4),
        "reason": "Water detected - no pollution" if meta.get('is_water_like') else "Analysis complete",
        "meta": meta,
        "timestamp": datetime.utcnow().isoformat()
    }), 200

@app.route('/predict_url', methods=['POST'])
def predict_url():
    """Predict from URL-hosted image."""
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": f"Invalid JSON: {e}"}), 400

    image_url = None
    if data:
        image_url = data.get('url') or data.get('image_url') or data.get('imageUrl')

    if not image_url:
        return jsonify({"error": "JSON must include 'image_url' or 'url'"}), 400

    logging.debug("predict_url received: %s", image_url[:50] if image_url else "None")

    forward_headers = {}
    auth_header = request.headers.get('Authorization')
    if auth_header:
        forward_headers['Authorization'] = auth_header

    try:
        fetched = fetch_image_with_retries(image_url, forward_headers, timeout=15)
        if isinstance(fetched, tuple):
            content, content_type = fetched
        else:
            content = fetched
            content_type = None
    except Exception as e:
        logging.warning("Failed to fetch image: %s", e)
        return jsonify({"error": f"Failed to fetch image from URL: {e}"}), 400

    if not isinstance(content, (bytes, bytearray)):
        return jsonify({"error": "Fetched content is not valid image bytes"}), 400

    try:
        img = Image.open(io.BytesIO(content)).convert('RGB')
    except Exception as e:
        logging.warning("Failed to open image: %s", e)
        return jsonify({"error": f"Failed to open fetched image: {e}"}), 400

    logging.info("=" * 60)
    logging.info("PREDICT_URL: Processing image from URL")
    p_plastic, p_oil, predicted_label, meta = fallback_predict_from_pil(img)
    
    logging.info("RESULT: label=%s, plastic=%.4f, oil=%.4f", predicted_label, p_plastic, p_oil)
    logging.info("=" * 60)
    
    # Map label to proper category for UI
    category_map = {
        'plastic': 'Plastic',
        'oil_spill': 'Oil Spill',
        'undetected': 'No Detection'
    }
    
    return jsonify({
        "plastic_prob": round(p_plastic, 4),
        "oil_prob": round(p_oil, 4),
        "predicted_label": predicted_label,
        "category": category_map.get(predicted_label, "No Detection"),
        "is_water_detection": meta.get('is_water_like', False),
        "confidence": 0.95 if predicted_label == 'undetected' and meta.get('is_water_like') else round(max(p_plastic, p_oil), 4),
        "reason": "Water detected - no pollution" if meta.get('is_water_like') else "Analysis complete",
        "meta": meta,
        "timestamp": datetime.utcnow().isoformat()
    }), 200

@app.route('/api/batch/predict', methods=['POST'])
def batch_predict():
    """Batch prediction from multiple image URLs."""
    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": f"Invalid JSON: {e}"}), 400
    
    urls = data.get('urls', [])
    if not isinstance(urls, list) or len(urls) == 0:
        return jsonify({"error": "Provide 'urls' as non-empty list"}), 400
    
    if len(urls) > 20:
        return jsonify({"error": "Maximum 20 URLs per batch"}), 400
    
    results = []
    logging.info("BATCH_PREDICT: Processing %d URLs", len(urls))
    
    for idx, image_url in enumerate(urls):
        try:
            logging.info("  [%d/%d] Processing: %s", idx+1, len(urls), image_url[:50])
            fetched = fetch_image_with_retries(image_url, None, timeout=15)
            if isinstance(fetched, tuple):
                content, _ = fetched
            else:
                content = fetched
            
            img = Image.open(io.BytesIO(content)).convert('RGB')
            p_plastic, p_oil, label, meta = fallback_predict_from_pil(img)
            
            results.append({
                "url": image_url,
                "predicted_label": label,
                "plastic_prob": round(p_plastic, 4),
                "oil_prob": round(p_oil, 4),
                "is_water": meta.get('is_water_like', False),
                "success": True
            })
        except Exception as e:
            results.append({
                "url": image_url,
                "success": False,
                "error": str(e)
            })
            logging.warning("  [%d/%d] Failed: %s", idx+1, len(urls), e)
    
    logging.info("BATCH_PREDICT: Completed %d/%d", sum(1 for r in results if r.get('success')), len(urls))
    
    return jsonify({
        "batch_size": len(urls),
        "successful": sum(1 for r in results if r.get('success')),
        "failed": sum(1 for r in results if not r.get('success')),
        "results": results
    }), 200

PREDICTIONS_FILE = os.path.join(os.path.dirname(__file__), 'predictions.json')

def load_predictions():
    if os.path.exists(PREDICTIONS_FILE):
        try:
            import json
            with open(PREDICTIONS_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception:
            logging.exception("Failed to read predictions file")
            return {}
    return {}

def save_predictions(preds):
    try:
        import json
        with open(PREDICTIONS_FILE, 'w', encoding='utf-8') as f:
            json.dump(preds, f, indent=2)
        return True
    except Exception:
        logging.exception("Failed to write predictions file")
        return False

@app.route('/api/reports/<report_id>/prediction', methods=['PUT', 'GET'])
def persist_prediction(report_id):
    """Save or retrieve prediction."""
    if request.method == 'GET':
        preds = load_predictions()
        entry = preds.get(str(report_id))
        if not entry:
            return jsonify({"found": False}), 404
        return jsonify({"found": True, "report_id": report_id, "prediction": entry}), 200

    force_save = request.args.get('force', 'false').lower() == 'true'
    if not TF_AVAILABLE and not force_save:
        logging.warning("TF unavailable — allowing fallback prediction to persist for report %s", report_id)

    try:
        data = request.get_json(force=True)
    except Exception as e:
        return jsonify({"error": f"Invalid JSON: {e}"}), 400

    if not data or 'predicted_label' not in data:
        return jsonify({"error": "Missing 'predicted_label' in request body"}), 400

    label = str(data['predicted_label'])
    preds = load_predictions()
    preds[str(report_id)] = {"predicted_label": label, "saved_by": "predict_service", "forced": force_save}
    ok = save_predictions(preds)
    if not ok:
        return jsonify({"success": False, "message": "Failed to save prediction"}), 500
    logging.info("Persisted prediction for report %s -> %s", report_id, label)
    return jsonify({"success": True, "report_id": report_id, "predicted_label": label, "forced": force_save}), 200

@app.route('/api/pollution/map', methods=['GET'])
def pollution_map_data():
    """Get pollution incidents for map visualization."""
    preds = load_predictions()
    
    pollution_hotspots = {
        "plastic": [
            {"lat": 25.7617, "lng": -80.1918, "name": "Miami Coast", "incidents": 12, "severity": "high"},
            {"lat": 34.0522, "lng": -118.2437, "name": "Los Angeles Harbor", "incidents": 8, "severity": "medium"},
            {"lat": 51.5074, "lng": -0.1278, "name": "Thames Estuary", "incidents": 5, "severity": "low"},
        ],
        "oil_spill": [
            {"lat": 28.9921, "lng": -89.6545, "name": "Gulf of Mexico", "incidents": 27, "severity": "critical"},
            {"lat": 43.5890, "lng": 7.5800, "name": "Mediterranean Sea", "incidents": 21, "severity": "high"},
            {"lat": 32.7157, "lng": 117.1611, "name": "South China Sea", "incidents": 18, "severity": "high"},
        ],
        "undetected": [
            {"lat": 48.8566, "lng": 2.3522, "name": "North Sea", "incidents": 15, "severity": "low"},
        ]
    }
    
    plastic_count = sum(1 for p in preds.values() if p.get("predicted_label") == "plastic")
    oil_count = sum(1 for p in preds.values() if p.get("predicted_label") == "oil_spill")
    undetected_count = sum(1 for p in preds.values() if p.get("predicted_label") == "undetected")
    
    return jsonify({
        "total_incidents": len(preds),
        "by_type": {
            "plastic": plastic_count,
            "oil_spill": oil_count,
            "undetected": undetected_count
        },
        "hotspots": pollution_hotspots,
        "last_updated": datetime.utcnow().isoformat()
    }), 200

@app.route('/', methods=['GET'])
def dashboard_home():
    """Serve interactive dashboard UI."""
    return render_template_string("""
    <!DOCTYPE html>
    <html>
    <head>
        <title>Marine DB - Prediction Dashboard</title>
        <style>
            body { font-family: Arial; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                   min-height: 100vh; padding: 20px; margin: 0; }
            .container { max-width: 1400px; margin: 0 auto; background: white; border-radius: 15px; 
                        box-shadow: 0 20px 60px rgba(0,0,0,0.3); padding: 40px; }
            h1 { color: #667eea; text-align: center; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
            .stat-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; 
                        padding: 25px; border-radius: 10px; text-align: center; }
            .stat-card h3 { font-size: 2.5em; margin: 10px 0; }
            .btn { background: #667eea; color: white; padding: 12px 30px; border: none; 
                  border-radius: 5px; cursor: pointer; font-size: 1em; margin: 5px; }
            .btn:hover { background: #764ba2; }
            .info { background: #f0f4ff; padding: 20px; border-radius: 5px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🌊 Marine DB Prediction Service</h1>
            <p style="text-align: center; color: #666; font-size: 1.1em;">AI-Powered Ocean Contamination Detection</p>
            
            <div class="info">
                <h3>✅ Service Status: RUNNING</h3>
                <p><strong>Mode:</strong> {% if tf_available %}TensorFlow Available{% else %}Using Fallback Heuristic{% endif %}</p>
                <p><strong>Plastic Threshold:</strong> {{ plastic_thr }}</p>
                <p><strong>Oil Threshold:</strong> {{ oil_thr }}</p>
            </div>
            
            <div class="stats">
                <div class="stat-card">
                    <h3>{{ total_preds }}</h3>
                    <p>Total Predictions</p>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #ff6b6b 0%, #c92a2a 100%);">
                    <h3>{{ plastic_count }}</h3>
                    <p>Plastic Detected</p>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #ffd43b 0%, #f08c00 100%);">
                    <h3>{{ oil_count }}</h3>
                    <p>Oil Spill Detected</p>
                </div>
                <div class="stat-card" style="background: linear-gradient(135deg, #a8adb5 0%, #636a7f 100%);">
                    <h3>{{ undetected_count }}</h3>
                    <p>No Detection</p>
                </div>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
                <button class="btn" onclick="window.location.href='/health'">Check Health</button>
                <button class="btn" onclick="window.location.href='/api/config'">View Config</button>
                <button class="btn" onclick="window.location.href='/api/analytics/summary'">View Analytics</button>
            </div>
            
            <div class="info">
                <h3>📚 API Endpoints</h3>
                <ul>
                    <li><strong>POST /predict</strong> - Upload image for prediction</li>
                    <li><strong>POST /predict_url</strong> - Predict from URL</li>
                    <li><strong>POST /api/batch/predict</strong> - Batch predictions (max 20 URLs)</li>
                    <li><strong>GET /health</strong> - Service health status</li>
                    <li><strong>GET /api/config</strong> - Configuration details</li>
                    <li><strong>GET /api/analytics/summary</strong> - Prediction statistics</li>
                </ul>
            </div>
        </div>
    </body>
    </html>
    """, tf_available=TF_AVAILABLE, plastic_thr=PLASTIC_THRESHOLD, oil_thr=OIL_THRESHOLD,
        total_preds=len(load_predictions()), 
        plastic_count=sum(1 for p in load_predictions().values() if p.get("predicted_label") == "plastic"),
        oil_count=sum(1 for p in load_predictions().values() if p.get("predicted_label") == "oil_spill"),
        undetected_count=sum(1 for p in load_predictions().values() if p.get("predicted_label") == "undetected")
    )

@app.route('/docs', methods=['GET'])
def documentation():
    """Serve API documentation."""
    return """
    # Marine DB Prediction Service - API Documentation
    
    ## Quick Start
    - **Dashboard**: GET http://localhost:5001/
    - **Health Check**: GET http://localhost:5001/health
    
    ## Endpoints
    - POST /predict - Upload image
    - POST /predict_url - Predict from URL
    - GET /health - Status
    - GET /api/config - Config
    - GET /api/analytics/summary - Stats
    """, 200, {'Content-Type': 'text/plain'}

# ==================== START SERVER ====================

if __name__ == '__main__':
    logging.info("=" * 70)
    logging.info("🚀 STARTING PREDICTION SERVICE")
    logging.info("=" * 70)
    logging.info("Available endpoints:")
    logging.info("  - Dashboard: http://localhost:5001/")
    logging.info("  - Health Check: http://localhost:5001/health")
    logging.info("  - Predict (POST): http://localhost:5001/predict")
    logging.info("  - Predict URL (POST): http://localhost:5001/predict_url")
    logging.info("=" * 70)
    
    port = int(os.environ.get('PREDICT_PORT', 5001))
    app.run(debug=True, host='0.0.0.0', port=port, threaded=True)