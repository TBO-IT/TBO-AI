import express from "express";
import dotenv from "dotenv";
import { clerkMiddleware, requireAuth } from '@clerk/express'

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

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