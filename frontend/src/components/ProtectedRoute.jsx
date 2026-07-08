import React from 'react';
import { Navigate } from 'react-router-dom';
import { estaAutenticado } from '../utils/auth';

function ProtectedRoute({ children }) {
  if (!estaAutenticado()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default ProtectedRoute;
