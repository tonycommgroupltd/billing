import { io } from 'socket.io-client';

// "undefined" means the URL will be computed from the `window.location` object
//const URL = process.env.NODE_ENV === 'production' ? undefined : 'http://localhost:3000';
const URL = process.env.REACT_APP_SOCKET_URL || undefined;
const socketSecure =
  typeof URL === 'string'
    ? URL.startsWith('https:')
    : typeof window !== 'undefined' && window.location.protocol === 'https:';

export const socket = io(URL, {
    path: "/socket.io/",
    transports: ['websocket', 'polling'],
    secure: socketSecure,
    autoConnect: false
});