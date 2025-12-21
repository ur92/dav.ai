export interface User {
  id: string;
  username: string;
  password: string;
}

export interface Group {
  id: string;
  name: string;
  description: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  isCustom: boolean;
}

export interface UserGroup {
  userId: string;
  groupId: string;
}

export interface UserPermission {
  userId: string;
  permissionId: string;
}

export interface GroupPermission {
  groupId: string;
  permissionId: string;
}

const USERS_KEY = 'test-app-users';
const AUTH_KEY = 'test-app-auth';
const GROUPS_KEY = 'test-app-groups';
const PERMISSIONS_KEY = 'test-app-permissions';
const USER_GROUPS_KEY = 'test-app-user-groups';
const USER_PERMISSIONS_KEY = 'test-app-user-permissions';
const GROUP_PERMISSIONS_KEY = 'test-app-group-permissions';

// Initialize with a default admin user if no users exist
export function initializeStorage(): void {
  const users = getUsers();
  if (users.length === 0) {
    const defaultUser: User = {
      id: '1',
      username: 'admin',
      password: 'admin123',
    };
    saveUsers([defaultUser]);
  }

  // Initialize default permissions (read, write, admin)
  const permissions = getPermissions();
  if (permissions.length === 0) {
    const defaultPermissions: Permission[] = [
      { id: '1', name: 'read', description: 'Read access', isCustom: false },
      { id: '2', name: 'write', description: 'Write access', isCustom: false },
      { id: '3', name: 'admin', description: 'Administrator access', isCustom: false },
    ];
    savePermissions(defaultPermissions);
  }
}

export function getUsers(): User[] {
  const data = localStorage.getItem(USERS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveUsers(users: User[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function addUser(user: Omit<User, 'id'>): User {
  const users = getUsers();
  const newUser: User = {
    ...user,
    id: Date.now().toString(),
  };
  users.push(newUser);
  saveUsers(users);
  return newUser;
}

export function updateUser(id: string, user: Partial<Omit<User, 'id'>>): User | null {
  const users = getUsers();
  const index = users.findIndex((u) => u.id === id);
  if (index === -1) return null;
  
  users[index] = { ...users[index], ...user };
  saveUsers(users);
  return users[index];
}

export function deleteUser(id: string): void {
  const users = getUsers();
  const filtered = users.filter((u) => u.id !== id);
  saveUsers(filtered);
  
  // Clean up user-group relationships
  const userGroups = getUserGroups();
  const filteredUserGroups = userGroups.filter((ug) => ug.userId !== id);
  saveUserGroups(filteredUserGroups);
  
  // Clean up user-permission relationships
  const userPermissions = getUserPermissions();
  const filteredUserPermissions = userPermissions.filter((up) => up.userId !== id);
  saveUserPermissions(filteredUserPermissions);
}

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_KEY) === 'true';
}

export function setAuthenticated(value: boolean): void {
  localStorage.setItem(AUTH_KEY, value.toString());
}

export function login(username: string, password: string): boolean {
  const users = getUsers();
  const user = users.find(
    (u) => u.username === username && u.password === password
  );
  if (user) {
    setAuthenticated(true);
    return true;
  }
  return false;
}

export function logout(): void {
  setAuthenticated(false);
}

// Groups CRUD
export function getGroups(): Group[] {
  const data = localStorage.getItem(GROUPS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveGroups(groups: Group[]): void {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export function addGroup(group: Omit<Group, 'id'>): Group {
  const groups = getGroups();
  const newGroup: Group = {
    ...group,
    id: Date.now().toString(),
  };
  groups.push(newGroup);
  saveGroups(groups);
  return newGroup;
}

export function updateGroup(id: string, group: Partial<Omit<Group, 'id'>>): Group | null {
  const groups = getGroups();
  const index = groups.findIndex((g) => g.id === id);
  if (index === -1) return null;
  
  groups[index] = { ...groups[index], ...group };
  saveGroups(groups);
  return groups[index];
}

export function deleteGroup(id: string): void {
  const groups = getGroups();
  const filtered = groups.filter((g) => g.id !== id);
  saveGroups(filtered);
  
  // Clean up group-user relationships
  const userGroups = getUserGroups();
  const filteredUserGroups = userGroups.filter((ug) => ug.groupId !== id);
  saveUserGroups(filteredUserGroups);
  
  // Clean up group-permission relationships
  const groupPermissions = getGroupPermissions();
  const filteredGroupPermissions = groupPermissions.filter((gp) => gp.groupId !== id);
  saveGroupPermissions(filteredGroupPermissions);
}

// User-Group relationships
export function getUserGroups(): UserGroup[] {
  const data = localStorage.getItem(USER_GROUPS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveUserGroups(userGroups: UserGroup[]): void {
  localStorage.setItem(USER_GROUPS_KEY, JSON.stringify(userGroups));
}

export function addUserToGroup(userId: string, groupId: string): void {
  const userGroups = getUserGroups();
  if (!userGroups.some((ug) => ug.userId === userId && ug.groupId === groupId)) {
    userGroups.push({ userId, groupId });
    saveUserGroups(userGroups);
  }
}

export function removeUserFromGroup(userId: string, groupId: string): void {
  const userGroups = getUserGroups();
  const filtered = userGroups.filter(
    (ug) => !(ug.userId === userId && ug.groupId === groupId)
  );
  saveUserGroups(filtered);
}

export function getUsersInGroup(groupId: string): User[] {
  const userGroups = getUserGroups();
  const userIds = userGroups
    .filter((ug) => ug.groupId === groupId)
    .map((ug) => ug.userId);
  const users = getUsers();
  return users.filter((u) => userIds.includes(u.id));
}

export function getGroupsForUser(userId: string): Group[] {
  const userGroups = getUserGroups();
  const groupIds = userGroups
    .filter((ug) => ug.userId === userId)
    .map((ug) => ug.groupId);
  const groups = getGroups();
  return groups.filter((g) => groupIds.includes(g.id));
}

// Permissions CRUD
export function getPermissions(): Permission[] {
  const data = localStorage.getItem(PERMISSIONS_KEY);
  return data ? JSON.parse(data) : [];
}

export function savePermissions(permissions: Permission[]): void {
  localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
}

export function addPermission(permission: Omit<Permission, 'id' | 'isCustom'>): Permission {
  const permissions = getPermissions();
  const newPermission: Permission = {
    ...permission,
    id: Date.now().toString(),
    isCustom: true,
  };
  permissions.push(newPermission);
  savePermissions(permissions);
  return newPermission;
}

export function updatePermission(id: string, permission: Partial<Omit<Permission, 'id' | 'isCustom'>>): Permission | null {
  const permissions = getPermissions();
  const perm = permissions.find((p) => p.id === id);
  if (!perm || !perm.isCustom) return null; // Can't update built-in permissions
  
  const index = permissions.findIndex((p) => p.id === id);
  if (index === -1) return null;
  
  permissions[index] = { ...permissions[index], ...permission };
  savePermissions(permissions);
  return permissions[index];
}

export function deletePermission(id: string): void {
  const permissions = getPermissions();
  const perm = permissions.find((p) => p.id === id);
  if (!perm || !perm.isCustom) return; // Can't delete built-in permissions
  
  const filtered = permissions.filter((p) => p.id !== id);
  savePermissions(filtered);
  
  // Clean up user-permission relationships
  const userPermissions = getUserPermissions();
  const filteredUserPermissions = userPermissions.filter((up) => up.permissionId !== id);
  saveUserPermissions(filteredUserPermissions);
  
  // Clean up group-permission relationships
  const groupPermissions = getGroupPermissions();
  const filteredGroupPermissions = groupPermissions.filter((gp) => gp.permissionId !== id);
  saveGroupPermissions(filteredGroupPermissions);
}

// User-Permission relationships
export function getUserPermissions(): UserPermission[] {
  const data = localStorage.getItem(USER_PERMISSIONS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveUserPermissions(userPermissions: UserPermission[]): void {
  localStorage.setItem(USER_PERMISSIONS_KEY, JSON.stringify(userPermissions));
}

export function addPermissionToUser(userId: string, permissionId: string): void {
  const userPermissions = getUserPermissions();
  if (!userPermissions.some((up) => up.userId === userId && up.permissionId === permissionId)) {
    userPermissions.push({ userId, permissionId });
    saveUserPermissions(userPermissions);
  }
}

export function removePermissionFromUser(userId: string, permissionId: string): void {
  const userPermissions = getUserPermissions();
  const filtered = userPermissions.filter(
    (up) => !(up.userId === userId && up.permissionId === permissionId)
  );
  saveUserPermissions(filtered);
}

export function getPermissionsForUser(userId: string): Permission[] {
  const userPermissions = getUserPermissions();
  const permissionIds = userPermissions
    .filter((up) => up.userId === userId)
    .map((up) => up.permissionId);
  const permissions = getPermissions();
  return permissions.filter((p) => permissionIds.includes(p.id));
}

// Group-Permission relationships
export function getGroupPermissions(): GroupPermission[] {
  const data = localStorage.getItem(GROUP_PERMISSIONS_KEY);
  return data ? JSON.parse(data) : [];
}

export function saveGroupPermissions(groupPermissions: GroupPermission[]): void {
  localStorage.setItem(GROUP_PERMISSIONS_KEY, JSON.stringify(groupPermissions));
}

export function addPermissionToGroup(groupId: string, permissionId: string): void {
  const groupPermissions = getGroupPermissions();
  if (!groupPermissions.some((gp) => gp.groupId === groupId && gp.permissionId === permissionId)) {
    groupPermissions.push({ groupId, permissionId });
    saveGroupPermissions(groupPermissions);
  }
}

export function removePermissionFromGroup(groupId: string, permissionId: string): void {
  const groupPermissions = getGroupPermissions();
  const filtered = groupPermissions.filter(
    (gp) => !(gp.groupId === groupId && gp.permissionId === permissionId)
  );
  saveGroupPermissions(filtered);
}

export function getPermissionsForGroup(groupId: string): Permission[] {
  const groupPermissions = getGroupPermissions();
  const permissionIds = groupPermissions
    .filter((gp) => gp.groupId === groupId)
    .map((gp) => gp.permissionId);
  const permissions = getPermissions();
  return permissions.filter((p) => permissionIds.includes(p.id));
}

// Effective permissions calculation
export function getEffectivePermissions(userId: string): Permission[] {
  // Get direct user permissions
  const directPermissions = getPermissionsForUser(userId);
  const directPermissionIds = new Set(directPermissions.map((p) => p.id));
  
  // Get all groups for user
  const userGroups = getGroupsForUser(userId);
  
  // Get all permissions from groups
  const groupPermissionIds = new Set<string>();
  userGroups.forEach((group) => {
    const groupPerms = getPermissionsForGroup(group.id);
    groupPerms.forEach((perm) => groupPermissionIds.add(perm.id));
  });
  
  // Combine direct and group permissions (union)
  const allPermissionIds = new Set([...directPermissionIds, ...groupPermissionIds]);
  const permissions = getPermissions();
  return permissions.filter((p) => allPermissionIds.has(p.id));
}

