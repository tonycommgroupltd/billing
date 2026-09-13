import actionTypes from '../../action-types/';
import { http } from '../../../helpers';
import { syncTicketsAuthAfterLogin } from '../../../helpers/ticketsAuth';
import {
  clearAutoFallback,
  FALLBACK,
  getApiMode,
  getAuthApiBase,
  isApiUnreachable,
  isForcedStandby,
  MODES,
  sanitizeApiBase,
  setApiMode,
  stripApiBasePrefix,
} from '../../../helpers/apiBase';
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

  const finishLogin = async (response, viaStandby = false) => {
    dispatch({ type: actionTypes.AUTH_LOADING, loading: false });
    if (!response.data) return;

    if (viaStandby) {
      // Keep JWT and API base on the same hub after Contabo timeout.
      setApiMode(MODES.STANDBY);
      const standbyBase = sanitizeApiBase(FALLBACK);
      sessionStorage.setItem('tcomm_api_base', standbyBase);
    } else {
      clearAutoFallback();
      if (getApiMode() === MODES.STANDBY && !isForcedStandby()) {
        // Successful Contabo login while UI said Standby — snap back to Production.
        setApiMode(MODES.PRODUCTION);
      }
    }

    dispatch({
      type: actionTypes.LOGIN_USER,
      currentUser: response.data.user,
      token: response.data.access_token
    });
    await syncTicketsAuthAfterLogin(
      user.email,
      user.password,
      response.data.tickets_token
    );
    if (from) {
      navigate(from?.pathname + from?.search);
    } else {
      navigate('/');
    }
    // Only welcome toast on login — no HA / tickets-sync toast spam.
    execToastInfo('top-right', 'Welcome, ' + response.data.user.name + '!');
  };

  const showLoginError = (err) => {
    dispatch({ type: actionTypes.AUTH_LOADING, loading: false });
    const status = err.response?.status;
    if (status === 422) {
      execToast('bottom-center', 'Some fields are missing');
      return;
    }
    if (status === 401) {
      execToast('bottom-center', 'Incorrect email or password');
      return;
    }
    if (status === 504 || status === 502 || status === 503) {
      execToast(
        'bottom-center',
        'Login timed out reaching the API (504/502). Check Contabo or switch HA mode to Auto/Standby.'
      );
      return;
    }
    if (!err.response) {
      execToast('bottom-center', 'Cannot reach the API. Check your network or HA mode.');
      return;
    }
    execToast('bottom-center', 'Something went wrong');
  };

  dispatch({ type: actionTypes.AUTH_LOADING, loading: true });

  http
    .post(
      '/login',
      {
        email: user.email,
        password: user.password,
      },
      {
        timeout: 12000,
        baseURL: sanitizeApiBase(getAuthApiBase()),
      }
    )
    .then((response) => finishLogin(response, false))
    .catch(async (err) => {
      // Even in Production mode, Contabo 504 should allow one standby login attempt.
      const mode = getApiMode();
      const status = err.response?.status;
      const timedOut =
        isApiUnreachable(err) ||
        status === 504 ||
        status === 502 ||
        status === 503 ||
        err.code === 'ECONNABORTED';
      const canTryStandby =
        timedOut &&
        FALLBACK &&
        mode !== MODES.STANDBY &&
        !err.config?.__loginStandbyRetried;

      if (!canTryStandby) {
        showLoginError(err);
        return;
      }

      try {
        const standbyBase = sanitizeApiBase(FALLBACK);
        const response = await http.post(
          stripApiBasePrefix('/login'),
          { email: user.email, password: user.password },
          {
            baseURL: standbyBase,
            timeout: 15000,
            __failoverRetried: true,
            __loginStandbyRetried: true,
          }
        );
        await finishLogin(response, true);
      } catch (standbyErr) {
        showLoginError(standbyErr.response ? standbyErr : err);
      }
    });
};
