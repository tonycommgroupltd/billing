import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { connect } from 'react-redux';
import PresenceAPI from '../../helpers/PresenceAPI';
import { getDeviceInfo } from '../../utils/deviceInfo';

const HEARTBEAT_MS = 60000;

const PresenceHeartbeat = ({ user }) => {
  const location = useLocation();
  const deviceRef = useRef(null);

  useEffect(() => {
    if (!user?.id) return undefined;
    deviceRef.current = getDeviceInfo();

    const send = () => {
      const device = deviceRef.current || getDeviceInfo();
      PresenceAPI.heartbeat({
        ...device,
        path: `${location.pathname}${location.search || ''}`,
      }).catch(() => {});
    };

    send();
    const timer = setInterval(send, HEARTBEAT_MS);

    const onVisible = () => {
      if (!document.hidden) send();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id, location.pathname, location.search]);

  return null;
};

const mapStateToProps = (state) => ({
  user: state.auth.currentUser,
});

export default connect(mapStateToProps)(PresenceHeartbeat);
