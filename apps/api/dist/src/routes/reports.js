import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { PrismaClient } from "@prisma/client";
import { logger } from "../lib/logger.js";
const router = Router();
const prisma = new PrismaClient();
// GET /reports - List all reports for the user
router.get("/", requireAuth(), async (req, res) => {
    try {
        const auth = req.auth;
        const userReports = await prisma.report.findMany({
            where: { userId: auth.userId },
            orderBy: { createdAt: 'desc' },
            include: { dataset: true }
        });
        // Map to expected frontend format
        return res.json(userReports.map(r => ({
            id: r.id,
            title: r.title,
            content: r.content,
            datasetId: r.datasetId,
            datasetName: r.dataset?.filename,
            createdAt: r.createdAt.toISOString()
        })));
    }
    catch (error) {
        logger.error({ err: error }, "Failed to fetch reports");
        return res.status(500).json({ error: "Failed to fetch reports" });
    }
});
// GET /reports/:id - Get a specific report
router.get("/:id", requireAuth(), async (req, res) => {
    try {
        const auth = req.auth;
        const id = req.params.id;
        const report = await prisma.report.findUnique({
            where: { id },
            include: { dataset: true }
        });
        if (!report || report.userId !== auth.userId) {
            return res.status(404).json({ error: "Report not found" });
        }
        return res.json({
            id: report.id,
            title: report.title,
            content: report.content,
            datasetId: report.datasetId,
            datasetName: report.dataset?.filename,
            createdAt: report.createdAt.toISOString()
        });
    }
    catch (error) {
        logger.error({ err: error }, "Failed to fetch report");
        return res.status(500).json({ error: "Failed to fetch report" });
    }
});
// POST /reports - Create a new report
router.post("/", requireAuth(), async (req, res) => {
    try {
        const auth = req.auth;
        const { title, content, datasetId } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: "Title and content are required" });
        }
        const newReport = await prisma.report.create({
            data: {
                userId: auth.userId,
                title,
                content,
                datasetId,
            }
        });
        return res.json(newReport);
    }
    catch (error) {
        logger.error({ err: error }, "Failed to create report");
        return res.status(500).json({ error: "Failed to create report" });
    }
});
// DELETE /reports/:id - Delete a report
router.delete("/:id", requireAuth(), async (req, res) => {
    try {
        const auth = req.auth;
        const id = req.params.id;
        // Ensure user owns report before deleting
        const existing = await prisma.report.findUnique({ where: { id } });
        if (!existing || existing.userId !== auth.userId) {
            return res.status(404).json({ error: "Report not found" });
        }
        await prisma.report.delete({ where: { id } });
        return res.status(204).send();
    }
    catch (error) {
        logger.error({ err: error }, "Failed to delete report");
        return res.status(500).json({ error: "Failed to delete report" });
    }
});
export default router;
