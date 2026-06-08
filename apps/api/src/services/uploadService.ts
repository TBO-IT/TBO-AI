import { prisma } from "../lib/prisma.js";

export async function createDataset(
    userId: string,
    filename: string
) {
    return prisma.dataset.create({
        data: {
            userId,
            filename,
            status: "UPLOADED",
        },
    });
}