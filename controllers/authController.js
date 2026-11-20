const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");

// genrate jwt token
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};
const generateRefreshToken = (userId) => {
  return jwt.sign(
    { id: userId, type: "refresh" },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    { expiresIn: "30d" },
  );
};

const refreshAccessToken = (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token is required" });
  }
  try {
    const decoded = jwt.verify(
      refreshToken,
      process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
    );
    if (decoded.type !== "refresh" || !decoded.id) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }
    return res.json({ token: generateToken(decoded.id) });
  } catch {
    return res.status(401).json({ message: "Refresh token expired or invalid" });
  }
};

// @desc register new user
// @route post /api/auth/register
// @access public

const registerUser = async (req, res) => {
  try {
    const { name, email, password, profileImageUrl, adminInviteToken } =
      req.body;

    // check if user exist
    const existUser = await User.findOne({ email });
    if (existUser) {
      res.status(400).json({ message: "User already exists" });
    }

    // Public registrations create workspaces; the invite token bootstraps a superadmin.
    let role = "admin";
    const superAdminInviteToken =
      process.env.SUPER_ADMIN_INVITE_TOKEN || process.env.ADMIN_INVITE_TOKEN;
    if (
      adminInviteToken &&
      superAdminInviteToken &&
      adminInviteToken === superAdminInviteToken
    ) {
      role = "superadmin";
    }

    // hash password
    const salt = await bcrypt.genSalt(10);
    const hasedPassword = await bcrypt.hash(password, salt);

    //create new user
    const user = await User.create({
      name,
      email,
      password: hasedPassword,
      profileImageUrl,
      role,
    });

    // return user data with jwt
    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      profileImageUrl: user.profileImageUrl,
      token: generateToken(user._id),
      refreshToken: generateRefreshToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc register new user
// @route post /api/auth/register
// @access public

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      res.status(401).json({ message: "Invalid email or password" });
    }

    // compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ message: "Invalid email or password" });
    }

    // return data with jwt
    res.status(200).json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImageUrl: user.profileImageUrl,
      },
      token: generateToken(user._id),
      refreshToken: generateRefreshToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc get user profile
// @route post /api/auth/profile
// @access private (request token)

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      res.status(404).json({ message: "Server error", error: error.message });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc update user profile
// @route post /api/auth/profile
// @access private (request token)

const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      res.status(404).json({ message: "User not found" });
    }

    user.name = req.body.name || user.name;
    user.email = req.body.email || user.email;
    if (req.body.profileImageUrl !== undefined) {
      user.profileImageUrl = req.body.profileImageUrl;
    }

    const updatedUser = await user.save();
    res.json({
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      role: updatedUser.role,
      profileImageUrl: updatedUser.profileImageUrl,
      token: generateToken(updatedUser._id),
      refreshToken: generateRefreshToken(updatedUser._id),
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (
      typeof currentPassword !== "string" ||
      typeof newPassword !== "string"
    ) {
      return res.status(400).json({
        message: "Current password and new password are required.",
      });
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters long." });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({
        message: "New password must be different from the current password.",
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const currentPasswordMatches = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!currentPasswordMatches) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    return res.status(200).json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Password change failed:", error);
    return res.status(500).json({ message: "Unable to change password." });
  }
};

// @route POST /api/auth/forgot-password
// @access public
const forgetPassword = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email });
    // Keep the response the same whether or not the email is registered.
    if (!user) {
      return res.status(200).json({
        message:
          "If an account exists for that email, a reset link has been sent.",
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save();

    const resetUrl = `http://localhost:5173/reset-password/${token}`;
    const transporter = nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: "Reset your password",
        text: `Use this link to reset your password. It expires in 1 hour: ${resetUrl}`,
        html: `<p>Use the link below to reset your password. It expires in 1 hour.</p><p><a href="${resetUrl}">Reset password</a></p>`,
      });
    } catch (mailError) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();
      throw mailError;
    }

    return res.status(200).json({
      message:
        "If an account exists for that email, a reset link has been sent.",
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Unable to send password reset email" });
  }
};

// @route POST /api/auth/reset-password/:token
// @access public
const resetPassword = async (req, res) => {
  try {
    const password = req.body?.password;
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters long",
      });
    }

    if (typeof req.params.token !== "string" || !req.params.token) {
      return res.status(400).json({ message: "Reset token is required" });
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(req.params.token)
      .digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Reset token is invalid or expired" });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Password reset failed:", error);
    return res.status(500).json({ message: "Unable to reset password" });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile,
  changePassword,
  forgetPassword,
  resetPassword,
  refreshAccessToken,
};
