"""
Marine DB Backend Configuration
Centralized settings for prediction service
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Service Config
SERVICE_HOST = os.getenv('SERVICE_HOST', '0.0.0.0')
SERVICE_PORT = int(os.getenv('SERVICE_PORT', 5001))
SERVICE_DEBUG = os.getenv('SERVICE_DEBUG', 'False').lower() == 'true'

# Model Config
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
PLASTIC_MODEL_PATH = os.path.join(MODEL_DIR, 'plastic_detection_model.h5')
OIL_MODEL_PATH = os.path.join(MODEL_DIR, 'oil_spill_detection_model.h5')

# Prediction Thresholds
PLASTIC_THRESHOLD = float(os.getenv('PRED_PLASTIC_THRESHOLD', 0.25))
OIL_THRESHOLD = float(os.getenv('PRED_OIL_THRESHOLD', 0.35))
NONE_THRESHOLD = float(os.getenv('PRED_NONE_THRESHOLD', 0.15))

# Image Processing
TARGET_SIZE = tuple(int(x) for x in os.getenv('PRED_TARGET_SIZE', '224,224').split(','))
CACHE_MAX_AGE = int(os.getenv('CACHE_MAX_AGE_HOURS', 24)) * 3600

# Batch Processing
MAX_BATCH_SIZE = 20
REQUEST_TIMEOUT = 15

# Data Storage
CACHE_DIR = os.path.join(os.path.dirname(__file__), 'cache_images')
PREDICTIONS_FILE = os.path.join(os.path.dirname(__file__), 'predictions.json')
LOGS_DIR = os.path.join(os.path.dirname(__file__), 'logs')

# Ensure directories exist
os.makedirs(CACHE_DIR, exist_ok=True)
os.makedirs(LOGS_DIR, exist_ok=True)

# IPFS Gateways (ordered by preference)
IPFS_GATEWAYS = [
    "https://ipfs.io/ipfs/",
    "https://cloudflare-ipfs.com/ipfs/",
    "https://dweb.link/ipfs/",
    "https://gateway.pinata.cloud/ipfs/",
    "https://infura-ipfs.io/ipfs/"
]
