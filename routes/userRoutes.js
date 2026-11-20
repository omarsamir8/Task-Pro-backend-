const express = require("express");
const { protect, adminOnly } = require("../middlewares/authMiddleware");
const {
  getUsers,
  getUserById,
  createUser,
  deleteUserById,
  updateUserById,
} = require("../controllers/userController");
const router = express.Router();

// user management Routes
router.get("/", protect, adminOnly, getUsers); //get all users (only admin can do it)
router.get("/:id", protect, adminOnly, getUserById); //get specific user and assigned tasks (admin only)
router.post("/", protect, adminOnly, createUser);
router.delete("/:id", protect, adminOnly, deleteUserById);
router.put("/:id", protect, adminOnly, updateUserById);

module.exports = router;
