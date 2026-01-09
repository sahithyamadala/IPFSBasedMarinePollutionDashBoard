import os
import sys
import numpy as np
from PIL import Image
import traceback
import tensorflow as tf

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
PLASTIC_MODEL = os.path.join(MODEL_DIR, 'plastic_detection_model.h5')
OIL_MODEL = os.path.join(MODEL_DIR, 'oil_spill_detection_model.h5')

def load_model(path):
    print(f"\nLoading model: {path} -> exists: {os.path.exists(path)}")
    m = tf.keras.models.load_model(path)
    m.summary()
    return m

def get_raw_pred(model, x):
    pred = model.predict(x)
    arr = np.asarray(pred)
    return arr

def to_input(img_path, size=(224,224), mode='255'):
    img = Image.open(img_path).convert('RGB').resize(size)
    arr = np.array(img, dtype=np.float32)
    if mode == '255':
        arr = arr / 255.0
    elif mode == 'imagenet':
        mean = np.array([0.485, 0.456, 0.406])
        std = np.array([0.229, 0.224, 0.225])
        arr = (arr / 255.0 - mean) / std
    else:
        arr = arr / 255.0
    x = np.expand_dims(arr, axis=0)
    return x

def test_image(img_path):
    print("\n" + "="*70)
    print(f"Testing: {img_path}")
    print("="*70)
    try:
        plastic = load_model(PLASTIC_MODEL)
        oil = load_model(OIL_MODEL)
    except Exception as e:
        print("Model load failed:", e)
        print(traceback.format_exc())
        return

    # Test with standard preprocessing (224x224, normalized 0-1)
    print(f"\n--- Standard Input (224x224, normalized) ---")
    try:
        x = to_input(img_path, size=(224,224), mode='255')
        print(f"Input shape: {x.shape}, min={x.min():.3f}, max={x.max():.3f}")
        
        raw_p = get_raw_pred(plastic, x)
        raw_o = get_raw_pred(oil, x)
        
        print(f"\nPLASTIC MODEL RAW OUTPUT:")
        print(f"  Shape: {np.asarray(raw_p).shape}")
        print(f"  Values: {np.asarray(raw_p).flatten()}")
        
        print(f"\nOIL MODEL RAW OUTPUT:")
        print(f"  Shape: {np.asarray(raw_o).shape}")
        print(f"  Values: {np.asarray(raw_o).flatten()}")
        
        # Try all possible interpretations
        print(f"\n--- INTERPRETATION OPTIONS ---")
        arr_p = np.asarray(raw_p).flatten()
        arr_o = np.asarray(raw_o).flatten()
        
        print(f"Option 1 - Index [0]: plastic={arr_p[0]:.4f}, oil={arr_o[0]:.4f}")
        if len(arr_p) > 1:
            print(f"Option 2 - Index [1]: plastic={arr_p[1]:.4f}, oil={arr_o[1]:.4f}")
        
        print(f"\n--- WINNER ---")
        p_prob = arr_p[0] if len(arr_p) == 1 else arr_p[1]
        o_prob = arr_o[0] if len(arr_o) == 1 else arr_o[1]
        
        if p_prob > o_prob:
            print(f"✓ PLASTIC: {p_prob:.4f} > {o_prob:.4f}")
        else:
            print(f"✓ OIL: {o_prob:.4f} > {p_prob:.4f}")
                
    except Exception as e:
        print("Error during inference:", e)
        print(traceback.format_exc())

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python model_test.py <image1> [image2 ...]")
        sys.exit(1)
    for img in sys.argv[1:]:
        if not os.path.exists(img):
            print("Image not found:", img)
            continue
        test_image(img)
