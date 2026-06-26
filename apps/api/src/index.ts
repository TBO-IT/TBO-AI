import express from "express";
import dotenv from "dotenv";
import { clerkMiddleware, requireAuth } from '@clerk/express'
import authRoutes from "./routes/auth.js";
import cors from "cors";
import testRoutes from "./routes/test.js";
import adminRoutes from "./routes/admin.js"
import meRoutes from "./routes/me.js";
import uploadRoutes from "./routes/upload.js";
import testAnalysisRoutes from "./routes/testAnalysis.js";
import datasetRoutes from "./routes/dataset.js";
import chatRoutes from "./routes/chat.js";
import metricsRoutes from "./routes/metrics.js";
import testRouter from "./routes/test.js";
import reportRoutes from "./routes/reports.js";
import deepDiveRoutes from "./routes/deep-dives.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

dotenv.config();

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // trust first proxy
app.use(helmet());
const PORT = process.env.PORT || 3000;

// Authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many authentication attempts. Please try again later.",
    },
});

// File uploads
const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Upload limit exceeded. Please try again later.",
    },
});

// AI chat / analytics
const chatLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 500,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Too many chat requests. Please slow down.",
    },
});


app.use(
    cors({
        origin: process.env.FRONTEND_URL,
        credentials: true,
    })
);

app.use(express.json({
    limit : "1mb"
}));
app.use(clerkMiddleware());

// DuckDB returns BigInt for COUNT(*) and integer aggregations.
// This replacer makes res.json() transparently convert BigInt → Number.
app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? Number(value) : value
);


app.use("/chat", chatLimiter, chatRoutes);
app.use("/test-analysis", testAnalysisRoutes);
app.use("/upload", uploadLimiter, uploadRoutes);
app.use("/dataset", datasetRoutes);
app.use("/admin", adminRoutes);
app.use("/test", testRouter);
app.use("/api", meRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/auth", authLimiter, authRoutes);
app.use("/reports", reportRoutes);
app.use("/deep-dives", deepDiveRoutes);

app.get("/", (req, res) => {
    res.json({ message: "Hello from api" })
})

app.get("/api/protected", requireAuth(), (req, res) => {
    const auth = (req as any).auth;
    res.json({ message: "Hello from protected API endpoint!", userId: auth.userId })
})

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`)
})