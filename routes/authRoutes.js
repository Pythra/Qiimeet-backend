const express = require("express");
const {
  registerPhone,
  updateProfile,
  getMyProfile,
  deleteProfile,
  getUserById,
  sendOTP,
  verifyOTP,
  verifyPhoneUpdate,
  getBlockedUsers,
  unblockUser
} = require("../controllers/authController"); 
const auth = require("../middleware/auth");

const router = express.Router();

router.post("/register", registerPhone);     // only public route
router.post("/send-otp", sendOTP);           // public route for OTP
router.post("/verify-otp", verifyOTP);       // public route for OTP verification
router.post("/verify-phone-update", auth, verifyPhoneUpdate); // secure route for phone update verification
router.put("/update", auth, updateProfile);  // secure
router.get("/me", auth, getMyProfile);       // secure
router.delete("/delete", auth, deleteProfile); // secure
router.get('/user/:id', auth, getUserById);
router.post("/add-requester", auth, require("../controllers/authController").addRequester); // secure
router.get("/my-requesters", auth, require("../controllers/authController").getRequesters); // secure
router.get("/can-send-request", auth, require("../controllers/authController").canSendRequest); // secure
router.post("/accept-connection", auth, require("../controllers/authController").acceptConnection); // secure
router.post("/reject-connection", auth, require("../controllers/authController").rejectConnection); // secure
router.get("/my-connections", auth, require("../controllers/authController").getConnections); // secure
router.post("/update-notification-token", auth, require("../controllers/authController").updateNotificationToken); // secure
router.put("/update-likes-dislikes", auth, require("../controllers/authController").updateLikesDislikes); // secure
router.post("/expire-request", auth, require("../controllers/authController").expireRequest); // secure
router.get("/request-timestamp", auth, require("../controllers/authController").getRequestTimestamp); // secure
router.post("/cancel-connection", auth, require("../controllers/authController").cancelConnection);
router.post("/block-user", auth, require("../controllers/authController").blockUser);
router.get("/blocked-users", auth, getBlockedUsers);
router.post("/unblock-user", auth, unblockUser);
router.post("/cleanup-likers-inconsistencies", auth, require("../controllers/authController").cleanupAllLikersInconsistencies); // secure
router.post("/cleanup-user-likers-inconsistencies", auth, require("../controllers/authController").cleanupUserLikersInconsistencies); // secure

module.exports = router;
