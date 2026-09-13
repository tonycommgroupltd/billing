import actionTypes from '../../action-types/';
import { http } from '../../../helpers';
import { toast } from "react-toastify";
import {
  Icon,
} from "../../../components/Component";

const CloseButton = () => {
  return (
    <span className="btn-trigger toast-close-button" role="button">
      <Icon name="cross"></Icon>
    </span>
  );
};

export const loginWithJWT = (user, navigate, from) => (dispatch) => {

  const execToast = (placement, message) => {
    toast.error(message, {
      position: placement,
      autoClose: true,
      hideProgressBar: true,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: false,
      closeButton: <CloseButton />,
    });
  };

  const execToastInfo = (placement, message) => {
    toast.info(message, {
      position: placement,
      autoClose: true,
      hideProgressBar: true,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: false,
      closeButton: <CloseButton />,
    });
  };

  dispatch({ type: actionTypes.AUTH_LOADING, loading: true });
  
  // Call database authentication API
  const apiUrl = process.env.REACT_APP_API_URL || '/api';
  const payload = new URLSearchParams({
    username: user.email, // Use email field as username from form
    password: user.password
  });

  fetch(`${apiUrl}/auth.php?action=login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'Accept': 'application/json',
    },
    credentials: 'include',
    body: payload.toString()
  })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => Promise.reject(err));
      }
      return response.json();
    })
    .then(data => {
      dispatch({ type: actionTypes.AUTH_LOADING, loading: false });
      
      if (data.success && data.user && data.token) {
        // Store token in both keys for compatibility
        localStorage.setItem('token', data.token);
        localStorage.setItem('auth_token', data.token);
        // Also store user data as fallback
        localStorage.setItem('user', JSON.stringify(data.user));
        
        dispatch({
          type: actionTypes.LOGIN_USER,
          currentUser: data.user,
          token: data.token
        });
        
        if (from) {
          navigate(from?.pathname + from?.search);
        } else {
          navigate('/');
        }
        
        execToastInfo("top-right", "Welcome, " + data.user.name + "!");
      } else {
        execToast("bottom-center", data.error || 'Login failed');
      }
    })
    .catch(err => {
      dispatch({ type: actionTypes.AUTH_LOADING, loading: false });
      
      const errorMessage = err.error || 'Invalid username or password';
      execToast("bottom-center", errorMessage);
    });
}
