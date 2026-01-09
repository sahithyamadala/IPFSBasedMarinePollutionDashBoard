import os
import sys
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import requests
from io import BytesIO
from PIL import Image

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///marine_db.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30)

# Initialize extensions
db = SQLAlchemy(app)
jwt = JWTManager(app)

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ==================== DATABASE MODELS ====================

class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='user')  # user, authority, scientific
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    reports = db.relationship('Report', backref='author', lazy=True, cascade='all, delete-orphan')

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Report(db.Model):
    __tablename__ = 'reports'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text)
    category = db.Column(db.String(50))  # Oil Spill, Plastic Waste, Chemical Runoff, Sewage
    location = db.Column(db.String(255))
    latitude = db.Column(db.Float)
    longitude = db.Column(db.Float)
    status = db.Column(db.String(20), default='pending')  # pending, verified, investigating
    severity = db.Column(db.String(20))  # Low, Medium, High, Critical
    ipfs_hash = db.Column(db.String(255))
    prediction_label = db.Column(db.String(50))  # plastic, oil_spill, unclassified
    prediction_confidence = db.Column(db.Float)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

# ==================== AUTH ROUTES ====================

@app.route('/api/auth/register', methods=['POST'])
def register():
    """Register a new user"""
    try:
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        password = data.get('password')
        role = data.get('role', 'user')

        if not all([username, email, password]):
            return jsonify({"error": "Missing required fields"}), 400

        if User.query.filter_by(username=username).first():
            return jsonify({"error": "Username already exists"}), 400

        if User.query.filter_by(email=email).first():
            return jsonify({"error": "Email already exists"}), 400

        user = User(username=username, email=email, role=role)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        logger.info(f"New user registered: {username}")
        return jsonify({"message": "User registered successfully", "user_id": user.id}), 201

    except Exception as e:
        logger.exception("Registration error")
        return jsonify({"error": str(e)}), 500

@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login user and return JWT token"""
    try:
        data = request.get_json()
        username = data.get('username')
        password = data.get('password')

        user = User.query.filter_by(username=username).first()
        if not user or not user.check_password(password):
            return jsonify({"error": "Invalid credentials"}), 401

        access_token = create_access_token(identity=user.id)
        logger.info(f"User logged in: {username}")
        
        return jsonify({
            "access_token": access_token,
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role
        }), 200

    except Exception as e:
        logger.exception("Login error")
        return jsonify({"error": str(e)}), 500

@app.route('/api/auth/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """Get current user info"""
    try:
        user_id = get_jwt_identity()
        user = User.query.get(user_id)
        if not user:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "created_at": user.created_at.isoformat()
        }), 200

    except Exception as e:
        logger.exception("Get user error")
        return jsonify({"error": str(e)}), 500

# ==================== REPORT ROUTES ====================

@app.route('/api/reports', methods=['POST'])
@jwt_required()
def create_report():
    """Create a new pollution report"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        report = Report(
            user_id=user_id,
            title=data.get('title'),
            description=data.get('description'),
            category=data.get('category'),
            location=data.get('location'),
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            severity=data.get('severity'),
            ipfs_hash=data.get('ipfs_hash'),
            prediction_label=data.get('prediction_label'),
            prediction_confidence=data.get('prediction_confidence')
        )
        db.session.add(report)
        db.session.commit()

        logger.info(f"Report created: {report.id} by user {user_id}")
        return jsonify({
            "message": "Report created successfully",
            "report_id": report.id,
            "status": report.status
        }), 201

    except Exception as e:
        db.session.rollback()
        logger.exception("Create report error")
        return jsonify({"error": str(e)}), 500

@app.route('/api/user-reports', methods=['GET'])
@jwt_required()
def get_user_reports():
    """Get all reports by current user"""
    try:
        user_id = get_jwt_identity()
        reports = Report.query.filter_by(user_id=user_id).all()

        reports_data = [{
            'id': r.id,
            'title': r.title,
            'category': r.category,
            'location': r.location,
            'status': r.status,
            'severity': r.severity,
            'ipfs_hash': r.ipfs_hash,
            'prediction_label': r.prediction_label,
            'prediction_confidence': r.prediction_confidence,
            'created_at': r.created_at.isoformat(),
            'updated_at': r.updated_at.isoformat()
        } for r in reports]

        return jsonify({"reports": reports_data}), 200

    except Exception as e:
        logger.exception("Get user reports error")
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/<int:report_id>', methods=['GET'])
@jwt_required()
def get_report(report_id):
    """Get a specific report"""
    try:
        report = Report.query.get(report_id)
        if not report:
            return jsonify({"error": "Report not found"}), 404

        return jsonify({
            'id': report.id,
            'title': report.title,
            'description': report.description,
            'category': report.category,
            'location': report.location,
            'status': report.status,
            'severity': report.severity,
            'ipfs_hash': report.ipfs_hash,
            'prediction_label': report.prediction_label,
            'prediction_confidence': report.prediction_confidence,
            'created_at': report.created_at.isoformat(),
            'updated_at': report.updated_at.isoformat()
        }), 200

    except Exception as e:
        logger.exception("Get report error")
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/<int:report_id>', methods=['PUT'])
@jwt_required()
def update_report(report_id):
    """Update a report"""
    try:
        user_id = get_jwt_identity()
        report = Report.query.get(report_id)
        
        if not report:
            return jsonify({"error": "Report not found"}), 404

        if report.user_id != user_id:
            return jsonify({"error": "Unauthorized"}), 403

        data = request.get_json()
        report.title = data.get('title', report.title)
        report.description = data.get('description', report.description)
        report.category = data.get('category', report.category)
        report.location = data.get('location', report.location)
        report.severity = data.get('severity', report.severity)
        report.status = data.get('status', report.status)
        
        db.session.commit()
        logger.info(f"Report updated: {report_id}")
        
        return jsonify({"message": "Report updated successfully"}), 200

    except Exception as e:
        db.session.rollback()
        logger.exception("Update report error")
        return jsonify({"error": str(e)}), 500

@app.route('/api/reports/<int:report_id>', methods=['DELETE'])
@jwt_required()
def delete_report(report_id):
    """Delete a report"""
    try:
        user_id = get_jwt_identity()
        report = Report.query.get(report_id)
        
        if not report:
            return jsonify({"error": "Report not found"}), 404

        if report.user_id != user_id:
            return jsonify({"error": "Unauthorized"}), 403

        db.session.delete(report)
        db.session.commit()
        logger.info(f"Report deleted: {report_id}")
        
        return jsonify({"message": "Report deleted successfully"}), 200

    except Exception as e:
        db.session.rollback()
        logger.exception("Delete report error")
        return jsonify({"error": str(e)}), 500

# ==================== PREDICTION ROUTES ====================

PREDICT_SERVICE_URL = os.environ.get('PREDICT_SERVICE_URL', 'http://localhost:5001')

@app.route('/api/upload-to-pinata', methods=['POST'])
@jwt_required()
def upload_to_pinata():
    """Upload file to IPFS via Pinata"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400

        file = request.files['file']
        
        # For now, generate a mock IPFS hash
        # In production, use Pinata API
        import hashlib
        file_hash = hashlib.sha256(file.read()).hexdigest()
        ipfs_hash = f"Qm{file_hash[:44]}"  # Mock IPFS format
        
        logger.info(f"File uploaded with hash: {ipfs_hash}")
        return jsonify({"ipfsHash": ipfs_hash}), 200

    except Exception as e:
        logger.exception("Upload error")
        return jsonify({"error": str(e)}), 500

@app.route('/api/predict', methods=['POST'])
@jwt_required()
def predict_image():
    """Forward prediction request to predict service"""
    try:
        if 'image' not in request.files:
            return jsonify({"error": "No image provided"}), 400

        file = request.files['image']
        
        # Forward to predict service
        files = {'image': (file.filename, file.stream, file.content_type)}
        response = requests.post(f'{PREDICT_SERVICE_URL}/predict', files=files, timeout=30)
        
        if response.status_code == 200:
            return jsonify(response.json()), 200
        else:
            return jsonify({"error": "Prediction service error"}), response.status_code

    except requests.exceptions.ConnectionError:
        logger.error("Cannot connect to predict service")
        return jsonify({"error": "Prediction service unavailable"}), 503
    except Exception as e:
        logger.exception("Prediction error")
        return jsonify({"error": str(e)}), 500

# ==================== HEALTH ROUTES ====================

@app.route('/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({
        "status": "ok",
        "message": "Marine DB API is running",
        "timestamp": datetime.utcnow().isoformat()
    }), 200

@app.route('/api/status', methods=['GET'])
def status():
    """Get API and services status"""
    try:
        predict_health = requests.get(f'{PREDICT_SERVICE_URL}/health', timeout=5).json()
    except:
        predict_health = {"status": "unavailable"}

    return jsonify({
        "api": {"status": "ok"},
        "predict_service": predict_health,
        "database": "ok",
        "timestamp": datetime.utcnow().isoformat()
    }), 200

# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(error):
    logger.exception("Internal server error")
    return jsonify({"error": "Internal server error"}), 500

# ==================== INITIALIZE DATABASE ====================

def init_db():
    """Initialize database"""
    with app.app_context():
        db.create_all()
        logger.info("Database initialized")

if __name__ == '__main__':
    init_db()
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
