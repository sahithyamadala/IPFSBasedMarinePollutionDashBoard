// ...example code to POST image file to prediction service and persist label...
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data'); // install with: npm install form-data axios

async function callPredictServiceWithFile(localImagePath, reportId, savePredictionUrl, token) {
  if (!fs.existsSync(localImagePath)) {
    throw new Error(`Local image not found: ${localImagePath}`);
  }

  const form = new FormData();
  form.append('image', fs.createReadStream(localImagePath));

  try {
    const resp = await axios.post('http://localhost:5001/predict', form, {
      headers: {
        ...form.getHeaders(),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      timeout: 20000
    });

    const { predicted_label } = resp.data || {};
    console.log('Predicted label:', predicted_label);

    // Persist to your backend (example)
    if (predicted_label) {
      try {
        await axios.put(`${savePredictionUrl}/${reportId}/prediction`, { predicted_label }, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });
        console.log(`Persisted prediction for report ${reportId}`);
      } catch (persistErr) {
        console.warn(`Failed to persist prediction for report ${reportId}:`, persistErr.message || persistErr);
      }
    }

  } catch (err) {
    console.error('Error calling prediction service:', err.response ? err.response.data : err.message);
    throw err;
  }
}

// Usage example (adapt to your upload handler)
(async () => {
  try {
    await callPredictServiceWithFile(
      'C:/Users/Lenovo/Desktop/marine_db/backend/img/test.jpg',
      123, // report id
      'http://localhost:5000/api/reports',
      'YOUR_AUTH_TOKEN_IF_NEEDED'
    );
  } catch (err) {
    console.error('Script failed:', err.message || err);
  }
})();
