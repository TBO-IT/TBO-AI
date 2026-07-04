import { prisma } from "../lib/prisma.js";
import { DatasetStatus } from "../constants/datasetStatus.js";

export async function createDataset(
    userId: string,
    filename: string,
    storagePath?: string
) {
    return prisma.dataset.create({
        data: {
            userId,
            filename,
            storagePath,
            status: DatasetStatus.UPLOADED,
        },
    });
}

export async function updateStatus(
    datasetId: string,
    status: string
) {
    return prisma.dataset.update({
        where: {
            id: datasetId,
        },
        data: {
            status,
        },
    });
}

export async function markCompleted(
    datasetId: string,
    rowCount: number,
    redisKey: string
) {
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

export async function markFailed(
    datasetId: string,
    errorMessage: string
) {
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

export async function getDataset(
    datasetId: string
) {
    return prisma.dataset.findFirst({
        where: {
            id: datasetId
        },
        
    });
}

export async function getDatasets(id: any) {
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