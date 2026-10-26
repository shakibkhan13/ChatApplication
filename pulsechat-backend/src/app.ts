
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { authRouter } from "./modules/auth/auth.routes";
import { errorMiddleware } from "./middleware/error.middleware";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
    origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000",
    credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(pinoHttp());

app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
});

app.use("/api/auth", authRouter);

// Add conversation and message routers as their modules are implemented.

app.use(errorMiddleware);
