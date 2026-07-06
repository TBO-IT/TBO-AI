import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { supabase }
    from "../lib/supabase.js";

export async function getDatasetUrl(
    storagePath: string
) {
    const { data, error } =
        await supabase.storage
            .from("datasets")
            .createSignedUrl(storagePath, 3600); // 1 hour expiry

    if (error) {
        throw error;
    }

    return data.signedUrl;
}

export async function downloadDataset(
    storagePath: string
) {
    const fileName = storagePath.replace(/[^a-zA-Z0-9.\-_]/g, '_');
    const tempPath = path.join("tmp", fileName);

    try {
        await fs.access(tempPath);
        return tempPath;
    } catch {
        // File doesn't exist, proceed to download
    }

    const { data, error } =
        await supabase.storage
            .from("datasets")
            .download(storagePath);

    if (error) {
        throw error;
    }

    const buffer =
        Buffer.from(
            await data.arrayBuffer()
        );

    await fs.mkdir(
        "tmp",
        { recursive: true }
    );

    await fs.writeFile(
        tempPath,
        buffer
    );

    return tempPath;
}