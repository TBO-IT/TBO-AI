import { useState } from "react";
import { api } from "../api/client";

export default function UploadPage() {
    const [file, setFile] = useState<File | null>(null);

    const [uploading, setUploading] =
        useState(false);

    const [datasetId, setDatasetId] =
        useState("");

    async function handleUpload() {

        if (!file) {
            return;
        }

        try {

            setUploading(true);

            const formData =
                new FormData();

            formData.append(
                "file",
                file
            );

            const response =
                await api.post(
                    "/upload",
                    formData
                );

            setDatasetId(
                response.data.datasetId
            );

        } catch (error) {

            console.error(error);

            alert("Upload failed");

        } finally {

            setUploading(false);

        }
    }

    return (
        <div className="p-8">

            <h1 className="text-3xl font-bold mb-6">
                Upload Dataset
            </h1>

            <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                    const selected =
                        e.target.files?.[0];

                    if (selected) {
                        setFile(selected);
                    }
                }}
            />

            <button
                onClick={handleUpload}
                disabled={
                    !file || uploading
                }
                className="
          ml-4
          px-4
          py-2
          bg-blue-600
          text-white
          rounded
        "
            >
                {
                    uploading
                        ? "Uploading..."
                        : "Upload"
                }
            </button>

            {datasetId && (
                <div className="mt-6">

                    <p>
                        Dataset Created:
                    </p>

                    <code>
                        {datasetId}
                    </code>

                </div>
            )}

        </div>
    );
}