#!/usr/bin/env python3
"""
MetraScan - Product Classification Training Pipeline (Phase 6)

This script trains a text-based product classifier (e.g., fastText, TF-IDF + SVM, or DistilBERT)
using the combined OCR text from a product's inspections.

Expected input format (JSONL):
{
    "productId": "...",
    "groundTruthCategory": "food",
    "ocrTextFeatures": "..."
}
"""

import json
import argparse
import sys
import logging
import os
import datetime
from collections import Counter

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import SGDClassifier
    from sklearn.pipeline import Pipeline
    from sklearn.metrics import classification_report, accuracy_score, precision_recall_fscore_support
    import joblib
except ImportError:
    print("scikit-learn is required. Run: pip install scikit-learn joblib")
    sys.exit(1)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def load_dataset(jsonl_path: str) -> list[dict]:
    dataset = []
    try:
        with open(jsonl_path, 'r') as f:
            for line in f:
                if line.strip():
                    dataset.append(json.loads(line))
        return dataset
    except FileNotFoundError:
        logger.error(f"Dataset not found at {jsonl_path}. Run export script first.")
        sys.exit(1)

def analyze_data(data: list[dict]):
    categories = Counter([d.get("groundTruthCategory") for d in data])
    logger.info("Category distribution in training set:")
    for cat, count in categories.items():
        logger.info(f" - {cat}: {count} examples")

def train(train_path: str, val_path: str, test_path: str, output_dir: str, model_version: str):
    logger.info(f"Loading data from {train_path}...")
    train_data = load_dataset(train_path)
    val_data = load_dataset(val_path)
    test_data = load_dataset(test_path)
    
    analyze_data(train_data)
    
    if len(train_data) < 50:
        logger.warning(f"Only {len(train_data)} training examples found. This is insufficient to train a reliable classifier.")
        logger.warning("Please collect more verified product categories through the MetraScan platform.")
        logger.warning("Aborting training to prevent fabricating an inaccurate model.")
        sys.exit(0)

    logger.info("Initializing classification model (TF-IDF + SVM)...")
    X_train = [d["ocrTextFeatures"] for d in train_data]
    y_train = [d["groundTruthCategory"] for d in train_data]

    X_val = [d["ocrTextFeatures"] for d in val_data]
    y_val = [d["groundTruthCategory"] for d in val_data]
    
    X_test = [d["ocrTextFeatures"] for d in test_data]
    y_test = [d["groundTruthCategory"] for d in test_data]

    pipeline = Pipeline([
        ('tfidf', TfidfVectorizer(max_features=5000, stop_words='english', ngram_range=(1,2))),
        ('clf', SGDClassifier(loss='log_loss', max_iter=1000, tol=1e-3, class_weight='balanced'))
    ])

    logger.info("Training loop started...")
    pipeline.fit(X_train, y_train)
    
    # Evaluate Validation
    logger.info(f"Evaluating on {len(val_data)} validation examples...")
    val_preds = pipeline.predict(X_val)
    val_acc = accuracy_score(y_val, val_preds)
    val_p, val_r, val_f1, _ = precision_recall_fscore_support(y_val, val_preds, average='weighted', zero_division=0)
    logger.info(f"Validation Metrics -> Acc: {val_acc:.3f}, Precision: {val_p:.3f}, Recall: {val_r:.3f}, F1: {val_f1:.3f}")

    # Evaluate Test
    logger.info(f"Evaluating on {len(test_data)} test examples...")
    if len(test_data) > 0:
        test_preds = pipeline.predict(X_test)
        test_acc = accuracy_score(y_test, test_preds)
        test_p, test_r, test_f1, _ = precision_recall_fscore_support(y_test, test_preds, average='weighted', zero_division=0)
        logger.info(f"Test Metrics -> Acc: {test_acc:.3f}, Precision: {test_p:.3f}, Recall: {test_r:.3f}, F1: {test_f1:.3f}")
    else:
        test_acc, test_p, test_r, test_f1 = 0, 0, 0, 0

    # Save model and metadata
    os.makedirs(output_dir, exist_ok=True)
    model_path = os.path.join(output_dir, f"model_{model_version}.joblib")
    joblib.dump(pipeline, model_path)
    
    metadata = {
        "model_version": model_version,
        "timestamp": datetime.datetime.utcnow().isoformat(),
        "training_examples": len(train_data),
        "validation_metrics": {
            "accuracy": val_acc,
            "precision": val_p,
            "recall": val_r,
            "f1": val_f1
        },
        "test_metrics": {
            "accuracy": test_acc,
            "precision": test_p,
            "recall": test_r,
            "f1": test_f1
        }
    }
    with open(os.path.join(output_dir, f"metadata_{model_version}.json"), 'w') as f:
        json.dump(metadata, f, indent=2)

    logger.info(f"Saved model version {model_version} and metadata to {output_dir}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train Product Classification Model")
    parser.add_argument("--train-data", required=True, help="Path to classification_train.jsonl")
    parser.add_argument("--val-data", required=True, help="Path to classification_val.jsonl")
    parser.add_argument("--test-data", required=True, help="Path to classification_test.jsonl")
    parser.add_argument("--output-dir", default="./models/classification", help="Directory to save the trained model")
    parser.add_argument("--version", default="v1.0", help="Model version identifier")
    
    args = parser.parse_args()
    train(args.train_data, args.val_data, args.test_data, args.output_dir, args.version)

