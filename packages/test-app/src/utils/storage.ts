export interface User {
  id: string;
  username: string;
  password: string;
}

const USERS_KEY = 'test-app-users';
const AUTH_KEY = 'test-app-auth';

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

export function deleteUser(id: string): void {
  const users = getUsers();
  const filtered = users.filter((u) => u.id !== id);
  saveUsers(filtered);
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

