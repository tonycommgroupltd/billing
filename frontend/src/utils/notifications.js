import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Default toast configuration options
const defaultOptions = {
  position: "top-right",
  autoClose: 3000,
  hideProgressBar: false,
  closeOnClick: true,
  pauseOnHover: true,
  draggable: true,
  progress: undefined,
};

// Extended options for different types
const extendedOptions = {
  ...defaultOptions,
  style: {
    fontFamily: 'Inter, system-ui, Avenir, Helvetica, Arial, sans-serif',
    fontSize: '14px',
  }
};

// Success notification - green theme
export const showSuccess = (message, options = {}) => {
  return toast.success(message, {
    ...extendedOptions,
    ...options,
    className: 'toast-success',
  });
};

// Error notification - red theme
export const showError = (message, options = {}) => {
  return toast.error(message, {
    ...extendedOptions,
    ...options,
    className: 'toast-error',
  });
};

// Info notification - blue theme
export const showInfo = (message, options = {}) => {
  return toast.info(message, {
    ...extendedOptions,
    ...options,
    className: 'toast-info',
  });
};

// Warning notification - orange/yellow theme
export const showWarning = (message, options = {}) => {
  return toast.warn(message, {
    ...extendedOptions,
    ...options,
    className: 'toast-warning',
  });
};

// Custom notification with specific type
export const showNotification = (type, message, options = {}) => {
  switch (type.toLowerCase()) {
    case 'success':
      return showSuccess(message, options);
    case 'error':
      return showError(message, options);
    case 'info':
      return showInfo(message, options);
    case 'warning':
    case 'warn':
      return showWarning(message, options);
    default:
      return showInfo(message, options);
  }
};

// For clearing all toasts
export const clearAllToasts = () => {
  toast.dismiss();
};

// Default export object with all methods
export default {
  success: showSuccess,
  error: showError,
  info: showInfo,
  warning: showWarning,
  warn: showWarning,
  notify: showNotification,
  clear: clearAllToasts,
};