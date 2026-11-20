const express = require("express");
const { adminOnly, protect } = require("../middlewares/authMiddleware");
const {
  exprtTasksReport,
  exprtUsersReport,
} = require("../controllers/reportController");
const router = express.Router();

router.get("/export/tasks", protect, adminOnly, exprtTasksReport);
router.get("/export/users", protect, adminOnly, exprtUsersReport);

module.exports = router;
