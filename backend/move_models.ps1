# Create models folder if it doesn't exist and move model files from Downloads (example) into it.
$modelsDir = "C:\Users\Lenovo\Desktop\marine_db\backend\models"
New-Item -ItemType Directory -Path $modelsDir -Force

# Example source paths (update these to where your model files currently are)
$srcPlastic = "C:\Users\Lenovo\Downloads\plastic_detection_model.h5"
$srcOil     = "C:\Users\Lenovo\Downloads\oil_spill_detection_model.h5"

# Copy (use Move-Item instead of Copy-Item if you want to delete source)
If (Test-Path $srcPlastic) { Copy-Item -Path $srcPlastic -Destination $modelsDir -Force }
If (Test-Path $srcOil)     { Copy-Item -Path $srcOil -Destination $modelsDir -Force }

Write-Output "Models placed in $modelsDir"
