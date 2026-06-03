import express from "express";
import dotenv from "dotenv";
import { clerkMiddleware, requireAuth } from '@clerk/express'
import authRoutes from "./routes/auth.js";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);
app.use("/auth", authRoutes);

app.use(clerkMiddleware())

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