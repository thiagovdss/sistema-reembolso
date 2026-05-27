import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import ReimbursementSystem from './App.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ReimbursementSystem />
  </React.StrictMode>
);
