const isAdminRole = (role) => role === "admin" || role === "superadmin";

const isSuperAdmin = (user) => user.role === "superadmin";

const getTaskScope = (user) => {
  if (isSuperAdmin(user)) return {};
  if (user.role === "admin") return { createdBy: user._id };
  return { assignedTo: user._id };
};

const getUserScope = (user) =>
  isSuperAdmin(user) ? {} : { createdBy: user._id };

module.exports = {
  getTaskScope,
  getUserScope,
  isAdminRole,
  isSuperAdmin,
};
