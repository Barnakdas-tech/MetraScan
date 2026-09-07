from fastapi import FastAPI, UploadFile, File
app = FastAPI(title="MetraScan AI Service", version="0.1.0")

@app.get("/health")
def health():
    return {"service":"metrascan-ai","status":"ok"}

@app.post("/api/ocr")
async def ocr(file: UploadFile = File(...)):
    return {
        "filename": file.filename,
        "status": "TODO",
        "message": "Next: OpenCV preprocessing + PaddleOCR + bounding boxes."
    }
