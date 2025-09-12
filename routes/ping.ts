import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({ message: "✅ Pong! Server is alive." });
});

router.get("/keep-alive", (_, res) => {
  res.send("OK");
});

export default router;
