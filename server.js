require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const app = express();
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const reportRoutes = require("./routes/reportRoutes");
const connectDB = require("./config/db");
app.use(morgan("dev"));
// middleware to handle CORS
app.use(
  cors({
    origin: process.env.CLIENT_URL || "https://task-pro-fawn.vercel.app", // Allow requests from the client URL specified in the environment variable or allow all origins if not specified
    methods: ["GET", "POST", "PUT", "DELETE"], // Allow specific HTTP methods
    allowedHeaders: ["Content-Type", "Authorization"], // Allow specific headers
  }),
);

// connect to database
connectDB();

// middleware
app.use(express.json()); // Parse incoming JSON requests
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/reports", reportRoutes);

//start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
