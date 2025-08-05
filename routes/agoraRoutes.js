const express = require("express");
const router = express.Router();
const { generateToken } = require("../controllers/agoraController");

router.get("/agora/token", generateToken);

module.exports = router; 