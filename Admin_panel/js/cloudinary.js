// Shared Cloudinary upload helpers for the admin panel
import { cloudinaryConfig } from "./cloudinary-config.js";

function assertCloudinaryConfig() {
  const { cloudName, uploadPreset } = cloudinaryConfig;
  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary configuration missing. Update cloudinary-config.js with your cloud name and unsigned upload preset.");
  }
  return cloudinaryConfig;
}

function buildUploadFormData(file, options = {}) {
  const { uploadPreset, folder: defaultFolder } = assertCloudinaryConfig();
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const folder = options.folder ?? defaultFolder;
  if (folder) {
    formData.append("folder", folder);
  }

  if (options.tags && options.tags.length) {
    formData.append("tags", options.tags.join(","));
  }

  if (options.context && typeof options.context === "object") {
    const contextEntries = Object.entries(options.context)
      .filter(([key, value]) => key && typeof key === "string" && value !== undefined && value !== null);
    if (contextEntries.length) {
      formData.append("context", contextEntries.map(([key, value]) => `${key}=${value}`).join("|"));
    }
  }

  return formData;
}

export async function uploadImageToCloudinary(file, options = {}) {
  if (!(file instanceof File)) {
    throw new TypeError("Expected a File instance for Cloudinary upload.");
  }

  const { cloudName } = assertCloudinaryConfig();
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`;
  const response = await fetch(endpoint, {
    method: "POST",
    body: buildUploadFormData(file, options)
  });

  if (!response.ok) {
    let errorMessage = `Cloudinary upload failed with status ${response.status}`;
    try {
      const errorPayload = await response.json();
      if (errorPayload?.error?.message) {
        errorMessage = errorPayload.error.message;
      }
    } catch (_) {
      // Ignore JSON parsing errors and keep the default message
    }
    throw new Error(errorMessage);
  }

  const payload = await response.json();
  return payload.secure_url ?? payload.url;
}

export async function uploadFileList(fileList, options = {}) {
  const files = Array.from(fileList ?? []);
  if (!files.length) {
    throw new Error("No files provided for upload.");
  }

  const uploadedUrls = [];
  for (const file of files) {
    try {
      const url = await uploadImageToCloudinary(file, options);
      uploadedUrls.push(url);
    } catch (err) {
      throw new Error(`Failed to upload \"${file.name}\": ${err.message}`);
    }
  }

  return uploadedUrls;
}
