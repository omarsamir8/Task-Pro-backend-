const Task = require("../models/Task");
const User = require("../models/User");
const mongoose = require("mongoose");
const { getTaskScope, isSuperAdmin } = require("../utils/accessControl");

const validateAssignedUsers = async (assignedTo, user) => {
  const userIds = [...new Set(assignedTo.map(String))];
  if (userIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    return { status: 400, message: "assignedTo contains an invalid user ID" };
  }

  if (!userIds.length) return null;

  const userFilter = { _id: { $in: userIds } };
  if (!isSuperAdmin(user)) userFilter.createdBy = user._id;

  const matchedUsers = await User.countDocuments(userFilter);
  if (matchedUsers !== userIds.length) {
    return {
      status: 403,
      message: "You can only assign tasks to users in your workspace",
    };
  }
  return null;
};

// @desc Get all taks (admin all,user only assigned tasks)
// @route /api/tasks
// @access private
const getTasks = async (req, res) => {
  try {
    const { status } = req.query;
    const onlyMine = req.query.mine === "true";
    const taskScope = getTaskScope(req.user);
    if (onlyMine && ["admin", "superadmin"].includes(req.user.role)) {
      taskScope.assignedTo = req.user._id;
    }
    const filter = { ...taskScope };

    if (status) {
      filter.status = status;
    }

    let tasks = await Task.find(filter).populate(
      "assignedTo",
      "name email profileImageUrl",
    );

    // added completed todo checklist to each task
    tasks = tasks.map((task) => {
      const completedCount = task.todoChecklist.filter(
        (item) => item.completed,
      ).length;
      return { ...task._doc, completedTodoCount: completedCount };
    });

    // status sammry count
    const allTasks = await Task.countDocuments(taskScope);

    const pendingTasks = await Task.countDocuments({
      ...taskScope,
      status: "Pending",
    });

    const inProgressTasks = await Task.countDocuments({
      ...taskScope,
      status: "In Progress",
    });
    const completedTasks = await Task.countDocuments({
      ...taskScope,
      status: "Completed",
    });

    res.json({
      tasks,
      statusSummry: {
        all: allTasks,
        pendingTasks,
        inProgressTasks,
        completedTasks,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc Get task by ID
// @route /api/tasks/:id
// @access private
const getTaskById = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      ...getTaskScope(req.user),
    }).populate(
      "assignedTo",
      "name email profileImageUrl ",
    );
    if (!task) {
      return res.status(404).json({ message: "no task found for this id" });
    }
    res.json(task);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc create new task
// @route /api/tasks/
// @access private (admin)
const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      priority,
      status,
      dueDate,
      assignedTo,
      attachments,
      todoChecklist,
    } = req.body;

    if (!Array.isArray(assignedTo)) {
      return res
        .status(400)
        .json({ message: "assignedTo must be an array of user IDs" });
    }
    const assignedUsersError = await validateAssignedUsers(
      assignedTo,
      req.user,
    );
    if (assignedUsersError) {
      return res
        .status(assignedUsersError.status)
        .json({ message: assignedUsersError.message });
    }

    const task = await Task.create({
      title,
      description,
      priority,
      status,
      dueDate,
      assignedTo,
      createdBy: req.user._id,
      attachments,
      todoChecklist,
    });

    res.status(201).json({ message: "task created successfully", task });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc update task details
// @route /api/tasks/:id
// @access private
const updateTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      ...getTaskScope(req.user),
    });

    if (!task) {
      return res.status(404).json({ message: "Task not found" });
    }

    if (req.body.title !== undefined) task.title = req.body.title;
    if (req.body.description !== undefined) task.description = req.body.description;
    if (req.body.priority !== undefined) task.priority = req.body.priority;
    if (req.body.dueDate !== undefined) task.dueDate = req.body.dueDate;
    if (req.body.attachments !== undefined) task.attachments = req.body.attachments;
    if (req.body.todoChecklist !== undefined) {
      if (!Array.isArray(req.body.todoChecklist)) {
        return res.status(400).json({ message: "todoChecklist must be an array" });
      }
      task.todoChecklist = req.body.todoChecklist;
      const completedCount = task.todoChecklist.filter(
        (item) => item.completed,
      ).length;
      task.progress = task.todoChecklist.length
        ? Math.round((completedCount / task.todoChecklist.length) * 100)
        : 0;
    }
    if (req.body.assignedTo !== undefined) {
      if (!Array.isArray(req.body.assignedTo)) {
        return res
          .status(400)
          .json({ message: "assignedTo must be an array of user IDs" });
      }
      const assignedUsersError = await validateAssignedUsers(
        req.body.assignedTo,
        req.user,
      );
      if (assignedUsersError) {
        return res
          .status(assignedUsersError.status)
          .json({ message: assignedUsersError.message });
      }
      task.assignedTo = req.body.assignedTo;
    }
    const updatedTask = await task.save();
    res.json({ message: "task updated successfully", task: updatedTask });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc delete task
// @route /api/tasks/:id
// @access private (admin only)
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      ...getTaskScope(req.user),
    });
    if (!task) {
      return res
        .status(404)
        .json({ message: `no task found for this id ${req.params.id}` });
    }
    await task.deleteOne();
    res.json({ message: "task deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc update task status
// @route /api/tasks/:id/status
// @access private
const updateTaskStatus = async (req, res) => {
  try {
    const task = await Task.findOne({
      _id: req.params.id,
      ...getTaskScope(req.user),
    });
    if (!task) {
      return res
        .status(404)
        .json({ message: `no task found for this id ${req.params.id}` });
    }

    const isAssigned = task.assignedTo.some(
      (userId) => userId.toString() === req.user._id.toString(),
    );
    if (
      !isAssigned &&
      !["admin", "superadmin"].includes(req.user.role)
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this task" });
    }

    task.status = req.body.status || task.status;

    if (task.status === "Completed") {
      task.todoChecklist.forEach((item) => {
        item.completed = true;
      });
      task.progress = 100;
    }
    await task.save();

    res.json({
      message: "task status updated successfully",
      task: task,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc task checklist
// @route /api/tasks/:id/todo
// @access private
const updateTaskChecklist = async (req, res) => {
  try {
    const { todoChecklist } = req.body;
    const task = await Task.findOne({
      _id: req.params.id,
      ...getTaskScope(req.user),
    });
    if (!task) {
      return res
        .status(404)
        .json({ message: `no task found for this id ${req.params.id}` });
    }
    if (!Array.isArray(todoChecklist)) {
      return res.status(400).json({ message: "todoChecklist must be an array" });
    }
    task.todoChecklist = todoChecklist;

    const completedCount = todoChecklist.filter(
      (item) => item.completed,
    ).length;
    task.progress = todoChecklist.length
      ? Math.round((completedCount / todoChecklist.length) * 100)
      : 0;

    if (task.progress === 100) {
      task.status = "Completed";
    } else if (task.progress > 0) {
      task.status = "In Progress";
    } else {
      task.status = "Pending";
    }

    await task.save();
    const updatedTask = await Task.findOne({
      _id: req.params.id,
      ...getTaskScope(req.user),
    }).populate(
      "assignedTo",
      "name email profileImageUrl",
    );
    res.json({
      message: "task checklist updated successfully",
      task: updatedTask,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc dashboard data (admin only)
// @route /api/tasks/dashboard-data
// @access private
const getDashboardData = async (req, res) => {
  try {
    const taskScope = getTaskScope(req.user);
    const totalTasks = await Task.countDocuments(taskScope);
    const pendingTasks = await Task.countDocuments({
      ...taskScope,
      status: "Pending",
    });
    const completedTasks = await Task.countDocuments({
      ...taskScope,
      status: "Completed",
    });
    const overdueTasks = await Task.countDocuments({
      ...taskScope,
      status: { $ne: "Completed" },
      dueDate: { $lt: new Date() },
    });

    // ensure all statuses are represented in the response, even if their count is zero
    const taskStatus = ["Pending", "In Progress", "Completed"];
    const taskDistributionRaw = await Task.aggregate([
      { $match: taskScope },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const taskDistribution = taskStatus.reduce((acc, status) => {
      const formattedKey = status.toLowerCase().replace(/\s+/g, "_"); //remove spaces for resonse keys
      acc[formattedKey] =
        taskDistributionRaw.find((item) => item._id === status)?.count || 0;
      return acc;
    }, {});
    taskDistribution["All"] = totalTasks;

    // ensure all priorities are represented in the response, even if their count is zero
    const taskPriorities = ["low", "medium", "high"];
    const taskPriorityDistributionRaw = await Task.aggregate([
      { $match: taskScope },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);
    const taskPriorityLevel = taskPriorities.reduce((acc, priority) => {
      const formattedKey = priority.toLowerCase().replace(/\s+/g, "_");
      acc[formattedKey] =
        taskPriorityDistributionRaw.find((item) => item._id === priority)
          ?.count || 0;
      return acc;
    }, {});

    // fetch recent 10 tasks
    const recentTasks = await Task.find(taskScope)
      .sort({ createdAt: -1 })
      .limit(10)
      .select("title status priority dueDate createdAt assignedTo");

    res.json({
      statistics: {
        totalTasks,
        pendingTasks,
        completedTasks,
        overdueTasks,
      },
      charts: {
        taskDistribution,
        taskPriorityLevel,
      },
      recentTasks,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc dashboard data (user only)
// @route /api/tasks/user-dashboard-data
// @access private
const getUserDashboardData = async (req, res) => {
  try {
    const taskScope = getTaskScope(req.user);
    const totalTasks = await Task.countDocuments(taskScope);
    const pendingTasks = await Task.countDocuments({
      ...taskScope,
      status: "Pending",
    });
    const completedTasks = await Task.countDocuments({
      ...taskScope,
      status: "Completed",
    });
    const overdueTasks = await Task.countDocuments({
      ...taskScope,
      status: { $ne: "Completed" },
      dueDate: { $lt: new Date() },
    });

    // ensure all statuses are represented in the response, even if their count is zero
    const taskStatus = ["Pending", "In Progress", "Completed"];
    const taskDistributionRaw = await Task.aggregate([
      {
        $match: taskScope,
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const taskDistribution = taskStatus.reduce((acc, status) => {
      const formattedKey = status.replace(/\s+/g, "_");
      acc[formattedKey] =
        taskDistributionRaw.find((item) => item._id === status)?.count || 0;
      return acc;
    }, {});
    taskDistribution["All"] = totalTasks;

    // ensure all priorities are represented in the response, even if their count is zero
    const taskPriorities = ["low", "medium", "high"];
    const taskPriorityDistributionRaw = await Task.aggregate([
      {
        $match: taskScope,
      },
      {
        $group: {
          _id: "$priority",
          count: { $sum: 1 },
        },
      },
    ]);
    const taskPriorityLevel = taskPriorities.reduce((acc, priority) => {
      const formattedKey = priority.replace(/\s+/g, "_");
      acc[formattedKey] =
        taskPriorityDistributionRaw.find((item) => item._id === priority)
          ?.count || 0;
      return acc;
    }, {});
    // fetch recent 10 tasks for the user
    const recentTasks = await Task.find(taskScope)
      .sort({ createdAt: -1 })
      .limit(10)
      .select("title status priority dueDate createdAt assignedTo");

    res.json({
      statistics: {
        totalTasks,
        pendingTasks,
        completedTasks,
        overdueTasks,
      },
      charts: {
        taskDistribution,
        taskPriorityLevel,
      },
      recentTasks,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getTasks,
  getTaskById,
  createTask,
  deleteTask,
  updateTask,
  updateTaskStatus,
  updateTaskChecklist,
  getDashboardData,
  getUserDashboardData,
};
