import { Router } from "express";
import { requireAuth } from "@clerk/express";
import { PrismaClient } from "@prisma/client";

const router = Router();
const prisma = new PrismaClient();

// GET /reports - List all reports for the user
router.get("/", requireAuth(), async (req, res) => {
    try {
        const auth = (req as any).auth;
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
    } catch (error) {
        console.error("Failed to fetch reports:", error);
        return res.status(500).json({ error: "Failed to fetch reports" });
    }
});

// GET /reports/:id - Get a specific report
router.get("/:id", requireAuth(), async (req, res) => {
    try {
        const auth = (req as any).auth;
        const { id } = req.params;

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
    } catch (error) {
        console.error("Failed to fetch report:", error);
        return res.status(500).json({ error: "Failed to fetch report" });
    }
});

// POST /reports - Create a new report
router.post("/", requireAuth(), async (req, res) => {
    try {
        const auth = (req as any).auth;
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
    } catch (error) {
        console.error("Failed to create report:", error);
        return res.status(500).json({ error: "Failed to create report" });
    }
});

// DELETE /reports/:id - Delete a report
router.delete("/:id", requireAuth(), async (req, res) => {
    try {
        const auth = (req as any).auth;
        const { id } = req.params;

        // Ensure user owns report before deleting
        const existing = await prisma.report.findUnique({ where: { id } });
        
        if (!existing || existing.userId !== auth.userId) {
            return res.status(404).json({ error: "Report not found" });
        }

        await prisma.report.delete({ where: { id } });

        return res.status(204).send();
    } catch (error) {
        console.error("Failed to delete report:", error);
        return res.status(500).json({ error: "Failed to delete report" });
    }
});

export default router;
