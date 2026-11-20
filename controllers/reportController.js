const Task = require("../models/Task");
const User = require("../models/User");
const excelJS = require("exceljs");
const { getTaskScope, getUserScope } = require("../utils/accessControl");

// @desc export tasks report on an excel file
// @route GET /api/reports/export/tasks
// @acess Private/Admin
const exprtTasksReport = async (req, res) => {
  try {
    const tasks = await Task.find(getTaskScope(req.user)).populate(
      "assignedTo",
      "name email",
    );
    const workbook = new excelJS.Workbook();
    const worksheet = workbook.addWorksheet("Tasks Report");
    worksheet.columns = [
      { header: "Task ID", key: "id", width: 10 },
      { header: "Title", key: "title", width: 30 },
      { header: "Description", key: "description", width: 50 },
      { header: "Priority", key: "priority", width: 20 },
      { header: "Status", key: "status", width: 20 },
      { header: "Assigned To", key: "assignedTo", width: 30 },
      { header: "Due Date", key: "dueDate", width: 30 },
    ];
    tasks.forEach((task) => {
      const assignedTo = (task.assignedTo || [])
        .filter(Boolean)
        .map((user) => `${user.name} ${user.email}`)
        .join(", ");
      worksheet.addRow({
        id: task._id,
        title: task.title,
        description: task.description,
        priority: task.priority,
        status: task.status,
        assignedTo: assignedTo || "Not Assigned",
        dueDate: task.dueDate
          ? task.dueDate.toISOString().split("T")[0]
          : "Not Assigned",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", "attachment; filename=tasks.xlsx");
    await workbook.xlsx.write(res).then(() => res.end());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc export users report on an excel file
// @route GET /api/reports/export/users
// @acess Private/Admin
const exprtUsersReport = async (req, res) => {
  try {
    const users = await User.find(getUserScope(req.user)).select(
      "name email _id",
    );
    const userTasks = await Task.find(getTaskScope(req.user)).populate(
      "assignedTo",
      "name email _id",
    );
    const userTaskMap = {};
    users.forEach((user) => {
      userTaskMap[user._id] = {
        name: user.name,
        email: user.email,
        taskCount: 0,
        pendingTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
      };
    });
    userTasks.forEach((task) => {
      (task.assignedTo || []).forEach((assignedUser) => {
        if (!assignedUser) return;
        const userId = assignedUser._id.toString();
        if (userTaskMap[userId]) {
          userTaskMap[userId].taskCount++;
          switch (task.status) {
            case "Pending":
              userTaskMap[userId].pendingTasks++;
              break;
            case "Completed":
              userTaskMap[userId].completedTasks++;
              break;
            case "In Progress":
              userTaskMap[userId].inProgressTasks++;
              break;
          }
        }
      });
    });

    const workbook = new excelJS.Workbook();
    const worksheet = workbook.addWorksheet("Users Report");
    worksheet.columns = [
      { header: "User ID", key: "id", width: 10 },
      { header: "Name", key: "name", width: 30 },
      { header: "Email", key: "email", width: 30 },
      { header: "Total Tasks", key: "taskCount", width: 20 },
      { header: "Pending Tasks", key: "pendingTasks", width: 20 },
      { header: "Completed Tasks", key: "completedTasks", width: 20 },
      { header: "In Progress Tasks", key: "inProgressTasks", width: 20 },
    ];

    Object.values(userTaskMap).forEach((user) => {
      worksheet.addRow(user);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");
    await workbook.xlsx.write(res).then(() => res.end());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { exprtTasksReport, exprtUsersReport };
