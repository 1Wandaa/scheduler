import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import '../styles/dialogs.css';

const GlobalDialogContext = createContext(null);

export const useGlobalDialog = () => {
  const context = useContext(GlobalDialogContext);
  if (!context) {
    throw new Error('useGlobalDialog must be used within a GlobalDialogProvider');
  }
  return context;
};

export const GlobalDialogProvider = ({ children }) => {
  const [dialogConfig, setDialogConfig] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const closeDialog = useCallback((result = null) => {
    setIsClosing(true);
    setTimeout(() => {
      if (dialogConfig?.resolve) {
        dialogConfig.resolve(result);
      }
      setDialogConfig(null);
      setIsClosing(false);
      setInputValue('');
    }, 200); // Matches CSS animation duration
  }, [dialogConfig]);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setDialogConfig({
        type: 'confirm',
        title: options.title || 'Are you sure?',
        text: options.text || '',
        icon: options.icon || 'warning',
        confirmButtonText: options.confirmButtonText || 'Confirm',
        cancelButtonText: options.cancelButtonText || 'Cancel',
        isDestructive: options.isDestructive || false,
        resolve,
      });
    });
  }, []);

  const prompt = useCallback((options) => {
    return new Promise((resolve) => {
      setInputValue(options.inputValue || '');
      setDialogConfig({
        type: 'prompt',
        title: options.title || 'Enter value',
        text: options.text || '',
        icon: options.icon || 'info',
        inputPlaceholder: options.inputPlaceholder || '',
        inputOptions: options.inputOptions || null,
        confirmButtonText: options.confirmButtonText || 'Submit',
        cancelButtonText: options.cancelButtonText || 'Cancel',
        resolve,
      });
    });
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && dialogConfig) {
        closeDialog(dialogConfig.type === 'prompt' ? null : false);
      }
      if (e.key === 'Enter' && dialogConfig?.type === 'prompt') {
        closeDialog(inputValue);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialogConfig, closeDialog, inputValue]);

  const renderIcon = (iconType) => {
    switch (iconType) {
      case 'warning': return <AlertTriangle size={24} />;
      case 'success': return <CheckCircle2 size={24} />;
      case 'error': return <XCircle size={24} />;
      case 'info':
      default: return <Info size={24} />;
    }
  };

  return (
    <GlobalDialogContext.Provider value={{ confirm, prompt }}>
      {children}
      
      {dialogConfig && (
        <div className={`dialog-overlay ${isClosing ? 'closing' : ''}`} onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            closeDialog(dialogConfig.type === 'prompt' ? null : false);
          }
        }}>
          <div className={`dialog-content ${isClosing ? 'closing' : ''}`}>
            <div className="dialog-header">
              <div className={`dialog-icon ${dialogConfig.icon}`}>
                {renderIcon(dialogConfig.icon)}
              </div>
              <h3 className="dialog-title">{dialogConfig.title}</h3>
            </div>
            
            <div className="dialog-body">
              {dialogConfig.text && <p>{dialogConfig.text}</p>}
              
              {dialogConfig.type === 'prompt' && (
                <div className="dialog-input-wrapper">
                  {dialogConfig.inputOptions ? (
                    <select
                      className="dialog-input"
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      autoFocus
                    >
                      <option value="" disabled>{dialogConfig.inputPlaceholder}</option>
                      {Object.entries(dialogConfig.inputOptions).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      className="dialog-input"
                      placeholder={dialogConfig.inputPlaceholder}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      autoFocus
                    />
                  )}
                </div>
              )}
            </div>

            <div className="dialog-footer">
              <button 
                className="back-btn" 
                onClick={() => closeDialog(dialogConfig.type === 'prompt' ? null : false)}
              >
                {dialogConfig.cancelButtonText}
              </button>
              <button 
                className={`btn ${dialogConfig.isDestructive ? 'btn-delete' : ''}`}
                style={dialogConfig.isDestructive ? { background: '#dc2626' } : {}}
                onClick={() => closeDialog(dialogConfig.type === 'prompt' ? inputValue : true)}
              >
                {dialogConfig.confirmButtonText}
              </button>
            </div>
          </div>
        </div>
      )}
    </GlobalDialogContext.Provider>
  );
};
