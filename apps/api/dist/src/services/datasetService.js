import { prisma } from "../lib/prisma.js";
import { DatasetStatus } from "../constants/datasetStatus.js";
export async function createDataset(userId, filename, storagePath) {
    return prisma.dataset.create({
        data: {
            userId,
            filename,
            storagePath,
            status: DatasetStatus.UPLOADED,
        },
    });
}
export async function updateStatus(datasetId, status) {
    return prisma.dataset.update({
        where: {
            id: datasetId,
        },
        data: {
            status,
        },
    });
}
export async function markCompleted(datasetId, rowCount, redisKey) {
    return prisma.dataset.update({
        where: {
            id: datasetId,
        },
        data: {
            status: DatasetStatus.COMPLETED,
            rowCount,
            redisKey,
            errorMessage: null,
        },
    });
}
export async function markFailed(datasetId, errorMessage) {
    return prisma.dataset.update({
        where: {
            id: datasetId,
        },
        data: {
            status: DatasetStatus.FAILED,
            errorMessage,
        },
    });
}
export async function getDataset(datasetId, userId) {
    return prisma.dataset.findFirst({
        where: {
            id: datasetId,
            userId
        },
    });
}
export async function getDatasets(id) {
    return prisma.dataset.findMany({
        orderBy: {
            uploadedAt: "desc",
        },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                },
            },
        },
    });
}
