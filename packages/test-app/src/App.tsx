import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { initializeStorage } from './utils/storage';
import { Login } from './components/Login';
import { UsersList } from './components/UsersList';
import { UserCreate } from './components/UserCreate';
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
            path="/users/list"
            element={
              <ProtectedRoute>
                <UsersList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/users/create"
            element={
              <ProtectedRoute>
                <UserCreate />
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/users/list" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;

