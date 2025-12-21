import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initializeStorage } from './utils/storage';
import { Login } from './components/Login';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { UsersList } from './components/UsersList';
import { UserCreate } from './components/UserCreate';
import { UserEdit } from './components/UserEdit';
import { UserDetail } from './components/UserDetail';
import { GroupsList } from './components/GroupsList';
import { GroupCreate } from './components/GroupCreate';
import { GroupEdit } from './components/GroupEdit';
import { GroupDetail } from './components/GroupDetail';
import { PermissionsList } from './components/PermissionsList';
import { PermissionCreate } from './components/PermissionCreate';
import { PermissionEdit } from './components/PermissionEdit';
import { PermissionDetail } from './components/PermissionDetail';
import { ProtectedRoute } from './components/ProtectedRoute';
import './App.css';

function App() {
  useEffect(() => {
    initializeStorage();
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout>
                  <Dashboard />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/list"
            element={
              <ProtectedRoute>
                <Layout>
                  <UsersList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <UserCreate />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/edit/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <UserEdit />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <UserDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/list"
            element={
              <ProtectedRoute>
                <Layout>
                  <GroupsList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <GroupCreate />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/edit/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <GroupEdit />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <GroupDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/permissions/list"
            element={
              <ProtectedRoute>
                <Layout>
                  <PermissionsList />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/permissions/create"
            element={
              <ProtectedRoute>
                <Layout>
                  <PermissionCreate />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/permissions/edit/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <PermissionEdit />
                </Layout>
              </ProtectedRoute>
            }
          />
          <Route
            path="/permissions/:id"
            element={
              <ProtectedRoute>
                <Layout>
                  <PermissionDetail />
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

