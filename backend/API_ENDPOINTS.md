# Marine DB Prediction Service - API Endpoints

## Core Prediction Endpoints

### 1. Health Check
**GET** `/health`
```json
Response: {
  "status": "ok|degraded",
  "tensorflow": true/false,
  "models_loaded": true/false,
  "plastic_threshold": 0.25,
  "oil_threshold": 0.35,
  "none_threshold": 0.15
}
```

### 2. Single Image Prediction (Upload)
**POST** `/predict`
- Content-Type: multipart/form-data
- Parameter: `image` (binary file)
```json
Response: {
  "plastic_prob": 0.15,
  "oil_prob": 0.08,
  "predicted_label": "unclassified|plastic|oil_spill|none",
  "confidence": 0.45,
  "reason": "Insufficient signal for classification",
  "timestamp": "2024-01-15T10:30:00"
}
```

### 3. URL-Based Prediction
**POST** `/predict_url`
- Content-Type: application/json
```json
Request: {
  "image_url": "https://example.com/image.jpg"
}

Response: {
  "plastic_prob": 0.72,
  "oil_prob": 0.05,
  "predicted_label": "plastic",
  "confidence": 0.85,
  "reason": "Strong plastic detection"
}
```

### 4. Batch Predictions
**POST** `/api/batch/predict`
- Content-Type: application/json
```json
Request: {
  "urls": ["url1", "url2", "url3"]
}

Response: {
  "batch_size": 3,
  "successful": 3,
  "failed": 0,
  "results": [
    {
      "url": "url1",
      "predicted_label": "plastic",
      "confidence": 0.92,
      "success": true
    }
  ]
}
```

## Analytics & Configuration

### 5. Analytics Summary
**GET** `/api/analytics/summary`
```json
Response: {
  "total_predictions": 157,
  "breakdown": {
    "plastic": 42,
    "oil_spill": 18,
    "unclassified": 65,
    "none": 32
  },
  "percentages": {
    "plastic": 26.7,
    "oil_spill": 11.5,
    "unclassified": 41.4,
    "none": 20.4
  }
}
```

### 6. Service Configuration
**GET** `/api/config`
```json
Response: {
  "tensorflow_available": true,
  "models_loaded": true,
  "target_size": [224, 224],
  "thresholds": {
    "plastic": 0.25,
    "oil_spill": 0.35,
    "none": 0.15
  }
}
```

## Image Retrieval

### 7. Report Image Proxy (with caching)
**GET** `/api/reports/<report_id>/image?cid=<ipfs_cid>`
- Returns cached image or fetches from IPFS

### 8. IPFS Connectivity Test
**POST** `/api/ipfs/test`
```json
Request: {
  "cid": "QmXxxx..."
}

Response: {
  "cid": "QmXxxx...",
  "cid_valid": true,
  "gateways_tested": [
    {
      "url": "https://ipfs.io/ipfs/QmXxxx",
      "status": 200,
      "success": true
    }
  ]
}
```

## Prediction Persistence

### 9. Save Prediction
**PUT** `/api/reports/<report_id>/prediction`
```json
Request: {
  "predicted_label": "plastic"
}

Response: {
  "success": true,
  "report_id": "123",
  "predicted_label": "plastic"
}
```

### 10. Retrieve Prediction
**GET** `/api/reports/<report_id>/prediction`
```json
Response: {
  "found": true,
  "prediction": {
    "predicted_label": "plastic"
  }
}
```

## Classification Labels

- **plastic** - Marine plastic/debris detected (high confidence)
- **oil_spill** - Oil spill detected (high confidence)
- **unclassified** - Insufficient signal; cannot classify
- **none** - Clean water with no contamination

## Error Responses

```json
{
  "error": "Description of error",
  "details": "Optional additional context"
}
```

**Common Status Codes:**
- 200: Success
- 400: Bad request (missing parameters)
- 404: Not found
- 502: Failed to fetch image from URL
