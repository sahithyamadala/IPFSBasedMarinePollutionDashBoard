from flask import Blueprint, request, jsonify, current_app
import os
from PIL import Image
import io
import numpy as np
import logging

# Exact AI prompt (for reference / copy-paste to your LLM):
# "Given an uploaded image from the authority dashboard, use the two pre-trained models
#  — `oil_spill_detection_model.h5` and `plastic_detection_model.h5` — to classify the image
#  into one of three categories: 'Oil Spill', 'Plastic Waste', or 'None'.
#  Preprocess the image exactly as the models expect, get prediction probabilities from both models,
#  use confidence threshold (default 0.6) and return JSON:
#  { "result": "...", "oil_spill_confidence": 0.87, "plastic_confidence": 0.23 }"

classify_bp = Blueprint('classify', __name__)

# Configurable thresholds (env vars) and preprocessing size
PLASTIC_THRESHOLD = float(os.environ.get('CLASSIFY_PLASTIC_THRESHOLD', 0.7))
OIL_THRESHOLD = float(os.environ.get('CLASSIFY_OIL_THRESHOLD', 0.7))
NONE_THRESHOLD = float(os.environ.get('CLASSIFY_NONE_THRESHOLD', 0.5))
MARGIN = float(os.environ.get('CLASSIFY_MARGIN', 0.15))
TARGET_SIZE = tuple(int(x) for x in os.environ.get('CLASSIFY_TARGET_SIZE', '128,128').split(','))

# Lazy load models on first request
_tf = None
_plastic_model = None
_oil_model = None

def ensure_models_loaded():
    global _tf, _plastic_model, _oil_model
    if _tf is None:
        try:
            import tensorflow as tf
            _tf = tf
        except Exception as e:
            logging.exception("TensorFlow import failed in classify route")
            raise

    if _plastic_model is None:
        if not os.path.exists(PLASTIC_MODEL_PATH):
            raise FileNotFoundError(f"Plastic model not found: {PLASTIC_MODEL_PATH}")
        _plastic_model = _tf.keras.models.load_model(PLASTIC_MODEL_PATH)

    if _oil_model is None:
        if not os.path.exists(OIL_MODEL_PATH):
            raise FileNotFoundError(f"Oil model not found: {OIL_MODEL_PATH}")
        _oil_model = _tf.keras.models.load_model(OIL_MODEL_PATH)

def preprocess_image_file(file_stream, target_size=TARGET_SIZE):
    # uses TARGET_SIZE env var; normalization /255 by default (adjust if models expect different)
    img = Image.open(io.BytesIO(file_stream.read())).convert('RGB').resize(target_size)
    arr = np.array(img, dtype=np.float32) / 255.0
    return np.expand_dims(arr, axis=0)

def interpret_model_output(pred):
    arr = np.asarray(pred)
    # handle common shapes
    if arr.shape == ():
        return float(arr)
    if arr.ndim == 1 and arr.size == 1:
        return float(arr[0])
    if arr.ndim == 2 and arr.shape[1] == 1:
        return float(arr[0,0])
    if arr.ndim == 2 and arr.shape[0] == 1 and arr.shape[1] >= 2:
        return float(arr[0,1])
    if arr.ndim == 1 and arr.size >= 2:
        return float(arr[1])
    return float(np.max(arr))

def clamp_prob(v):
    try:
        v = float(v)
    except Exception:
        return 0.0
    return float(max(0.0, min(1.0, v)))

def decide_label(plastic_conf, oil_conf,
                 plastic_threshold=PLASTIC_THRESHOLD,
                 oil_threshold=OIL_THRESHOLD,
                 none_threshold=NONE_THRESHOLD,
                 margin=MARGIN):
    """
    Balanced decision logic (improved):
      - If both < none_threshold -> 'None'
      - If both >= their thresholds -> choose by margin from 0.5; if margin small -> 'None'
      - If only one meets its threshold -> choose that
      - Else if max >= none_threshold -> pick higher
      - Else -> 'None'
    Returns (label, reason)
    """
    p = clamp_prob(plastic_conf)
    o = clamp_prob(oil_conf)
    logging.info("Decide_label inputs: plastic=%.4f, oil=%.4f p_th=%.2f o_th=%.2f none=%.2f margin=%.2f",
                 p, o, plastic_threshold, oil_threshold, none_threshold, margin)

    # both below none_threshold => None
    if p < none_threshold and o < none_threshold:
        return 'None', f'both below none_threshold ({p:.3f},{o:.3f})'

    # both meet their thresholds
    if p >= plastic_threshold and o >= oil_threshold:
        # require margin to prefer one; if too close, return None
        margin_p = p - 0.5
        margin_o = o - 0.5
        diff = abs(margin_p - margin_o)
        if diff < margin:
            return 'None', f'both above thresholds but margin too small ({p:.3f},{o:.3f})'
        if margin_p > margin_o:
            return 'Plastic Waste', f'both above thresholds; plastic stronger ({p:.3f} vs {o:.3f})'
        else:
            return 'Oil Spill', f'both above thresholds; oil stronger ({o:.3f} vs {p:.3f})'

    # only plastic meets threshold
    if p >= plastic_threshold and o < oil_threshold:
        return 'Plastic Waste', f'plastic >= plastic_threshold ({p:.3f}) and oil below ({o:.3f})'
    # only oil meets threshold
    if o >= oil_threshold and p < plastic_threshold:
        return 'Oil Spill', f'oil >= oil_threshold ({o:.3f}) and plastic below ({p:.3f})'

    # fallback: if at least one >= none_threshold pick higher
    if max(p, o) >= none_threshold:
        if p >= o:
            return 'Plastic Waste', f'fallback pick higher >= none_threshold ({p:.3f} vs {o:.3f})'
        else:
            return 'Oil Spill', f'fallback pick higher >= none_threshold ({o:.3f} vs {p:.3f})'

    return 'None', f'no clear signal ({p:.3f},{o:.3f})'

# ensure model paths are defined (fix: these were missing)
MODELS_DIR = os.path.join(os.path.dirname(__file__), '..', 'models')
PLASTIC_MODEL_PATH = os.path.join(MODELS_DIR, 'plastic_detection_model.h5')
OIL_MODEL_PATH = os.path.join(MODELS_DIR, 'oil_spill_detection_model.h5')

@classify_bp.route('/classify', methods=['POST'])
def classify_image():
    """
    Accepts multipart/form-data with field 'file' (image upload).
    Returns JSON:
      { "result": "Oil Spill"|"Plastic Waste"|"None",
        "oil_spill_confidence": 0.xx,
        "plastic_confidence": 0.yy,
        "threshold": 0.6,
        "reason": "explanation" }
    """
    try:
        ensure_models_loaded()
    except Exception as e:
        logging.exception("Models not loaded")
        return jsonify({"error": "Models not available", "details": str(e)}), 503

    if 'file' not in request.files:
        return jsonify({"error": "Missing file field 'file'"}), 400

    file = request.files['file']
    try:
        x = preprocess_image_file(file)
    except Exception as e:
        logging.exception("Invalid image")
        return jsonify({"error": "Invalid image", "details": str(e)}), 400

    try:
        p_plastic_raw = _plastic_model.predict(x)
        p_oil_raw = _oil_model.predict(x)
        plastic_conf = interpret_model_output(p_plastic_raw)
        oil_conf = interpret_model_output(p_oil_raw)
        # debug log raw shapes/values
        logging.info("Raw model outputs: plastic_raw_shape=%s, oil_raw_shape=%s", getattr(p_plastic_raw, 'shape', str(type(p_plastic_raw))), getattr(p_oil_raw, 'shape', str(type(p_oil_raw))))
        logging.info("Interpreted confidences: plastic=%.4f, oil=%.4f", plastic_conf, oil_conf)
    except Exception as e:
        logging.exception("Model inference failed")
        return jsonify({"error": "Model inference failed", "details": str(e)}), 500

    # Balanced decision — use defaults (PLASTIC_THRESHOLD, OIL_THRESHOLD, NONE_THRESHOLD, MARGIN)
    result, reason = decide_label(plastic_conf, oil_conf)

    return jsonify({
        "result": result,
        "oil_spill_confidence": float(round(oil_conf, 4)),
        "plastic_confidence": float(round(plastic_conf, 4)),
        "plastic_threshold": PLASTIC_THRESHOLD,
        "oil_threshold": OIL_THRESHOLD,
        "none_threshold": NONE_THRESHOLD,
        "margin": MARGIN,
        "reason": reason
    }), 200
