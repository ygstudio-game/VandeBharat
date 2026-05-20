"""Shared Cloudinary upload helpers used by all Python services."""
import os
import cloudinary
import cloudinary.uploader

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
)

def upload_frame(file_path: str, folder: str) -> dict:
    result = cloudinary.uploader.upload(
        file_path,
        folder=folder,
        resource_type="image",
        format="jpg",
    )
    return {"url": result["secure_url"], "public_id": result["public_id"]}
