import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

import { supabase }
    from "../lib/supabase.js";

export async function downloadDataset(
    storagePath: string
) {

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

    const tempPath =
        path.join(
            "tmp",
            `${crypto.randomUUID()}.csv`
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