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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);

app.use(express.json());
app.use(clerkMiddleware());

// DuckDB returns BigInt for COUNT(*) and integer aggregations.
// This replacer makes res.json() transparently convert BigInt → Number.
app.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? Number(value) : value
);


app.use("/chat", chatRoutes);
app.use("/test-analysis", testAnalysisRoutes);
app.use("/upload", uploadRoutes);
app.use("/dataset", datasetRoutes);
app.use("/admin", adminRoutes);
app.use("/test", testRouter);
app.use("/api", meRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/auth", authRoutes);
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