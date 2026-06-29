import { prisma } from "../lib/prisma.js";
export async function authorizeDatasetAccess(datasetId, userId) {
    const dataset = await prisma.dataset.findFirst({
        where: {
            id: datasetId,
            userId,
        },
    });
    if (!dataset) {
        throw new Error("Dataset not found or access denied.");
    }
    return dataset;
}
