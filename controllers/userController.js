const Task = require("../models/Task");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const { getTaskScope, getUserScope, isSuperAdmin } = require("../utils/accessControl");

const isValidRole = (role, allowSuperAdmin) =>
  ["admin", "member"].includes(role) || (allowSuperAdmin && role === "superadmin");
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getUsers = async (req, res) => {
  try {
    const userScope = getUserScope(req.user);
    const taskScope = getTaskScope(req.user);
    const users = await User.find(userScope).select("-password");
    const usersWithTaskCounts = await Promise.all(
      users.map(async (user) => {
        const [pendingTasks, inProgressTasks, completedTasks] =
          await Promise.all([
            Task.countDocuments({
              ...taskScope,
              assignedTo: user._id,
              status: "Pending",
            }),
            Task.countDocuments({
              ...taskScope,
              assignedTo: user._id,
              status: "In Progress",
            }),
            Task.countDocuments({
              ...taskScope,
              assignedTo: user._id,
              status: "Completed",
            }),
          ]);

        return {
          ...user.toObject(),
          pendingTasks,
          inProgressTasks,
          completedTasks,
        };
      }),
    );

    return res.json(usersWithTaskCounts);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Unable to load users", error: error.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      ...getUserScope(req.user),
    }).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const tasks = await Task.find({
      ...getTaskScope(req.user),
      assignedTo: user._id,
    })
      .select(
        "title description status priority dueDate progress todoChecklist assignedTo createdAt updatedAt",
      )
      .populate("assignedTo", "name email profileImageUrl")
      .sort({ updatedAt: -1 });

    return res.json({ ...user.toObject(), tasks });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

const createUser = async (req, res) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const { password, profileImageUrl } = req.body;
    const role = req.body.role || "member";

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email, and password are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Enter a valid email address" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters long" });
    }
    if (!isValidRole(role, isSuperAdmin(req.user))) {
      return res
        .status(400)
        .json({ message: "Invalid role for this account" });
    }
    if (profileImageUrl !== undefined && profileImageUrl !== null && typeof profileImageUrl !== "string") {
      return res.status(400).json({ message: "Profile image URL must be a string" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }

    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      role,
      createdBy: req.user._id,
      profileImageUrl: profileImageUrl || null,
    });
    const publicUser = user.toObject();
    delete publicUser.password;

    return res.status(201).json({
      message: "User created successfully",
      user: publicUser,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    return res.status(500).json({ message: "Unable to create user", error: error.message });
  }
};

const updateUserById = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      ...getUserScope(req.user),
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (req.body.name !== undefined) {
      if (typeof req.body.name !== "string" || !req.body.name.trim()) {
        return res.status(400).json({ message: "Name cannot be empty" });
      }
      user.name = req.body.name.trim();
    }

    if (req.body.email !== undefined) {
      if (typeof req.body.email !== "string") {
        return res.status(400).json({ message: "Enter a valid email address" });
      }
      const email = req.body.email.trim().toLowerCase();
      if (!isValidEmail(email)) {
        return res.status(400).json({ message: "Enter a valid email address" });
      }
      const existingUser = await User.findOne({
        email,
        _id: { $ne: user._id },
      });
      if (existingUser) {
        return res
          .status(409)
          .json({ message: "A user with this email already exists" });
      }
      user.email = email;
    }

    if (req.body.role !== undefined) {
      if (!isValidRole(req.body.role, isSuperAdmin(req.user))) {
        return res
          .status(400)
          .json({ message: "Invalid role for this account" });
      }
      user.role = req.body.role;
    }

    if (req.body.profileImageUrl !== undefined) {
      if (
        req.body.profileImageUrl !== null &&
        typeof req.body.profileImageUrl !== "string"
      ) {
        return res
          .status(400)
          .json({ message: "Profile image URL must be a string" });
      }
      user.profileImageUrl = req.body.profileImageUrl || null;
    }

    if (req.body.password !== undefined && req.body.password !== "") {
      if (
        typeof req.body.password !== "string" ||
        req.body.password.length < 8
      ) {
        return res
          .status(400)
          .json({ message: "Password must be at least 8 characters long" });
      }
      user.password = await bcrypt.hash(req.body.password, 10);
    }

    await user.save();
    const publicUser = user.toObject();
    delete publicUser.password;

    return res.json({
      message: "User updated successfully",
      user: publicUser,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A user with this email already exists" });
    }
    return res.status(500).json({ message: "Unable to update user", error: error.message });
  }
};

const deleteUserById = async (req, res) => {
  try {
    const user = await User.findOneAndDelete({
      _id: req.params.id,
      ...getUserScope(req.user),
    });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUserById,
  deleteUserById,
};
