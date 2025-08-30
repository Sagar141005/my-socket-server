import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.status(200).json({ message: "✅ Pong! Server is alive." });
});

export default router;
