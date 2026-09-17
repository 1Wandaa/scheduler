import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App' // Or wherever your main App component is
import { GlobalDialogProvider } from './context/GlobalDialogContext';
import { Toaster } from 'sonner';
import ErrorBoundary from './components/ErrorBoundary/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <GlobalDialogProvider>
          <App />
          <Toaster position="top-right" richColors />
        </GlobalDialogProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)