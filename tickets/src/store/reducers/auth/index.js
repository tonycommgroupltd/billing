import actionTypes from '../../action-types';
// Check both token keys for compatibility
const hasToken = !!(localStorage.getItem('token') || localStorage.getItem('auth_token'));
const hasStoredUser = !!localStorage.getItem('user');
// Try to get stored user for initial state
let initialUser = null;
if (hasStoredUser) {
    try {
        initialUser = JSON.parse(localStorage.getItem('user'));
    } catch (e) {
        console.error('Failed to parse stored user on init:', e);
    }
}
const initialState = {
    // Only set isLoggedIn to true if we have both token AND user data
    // This prevents routing errors when user is null
    isLoggedIn: hasToken && hasStoredUser && initialUser !== null,
    isAuthLoading: hasToken && !hasStoredUser, // Loading if token exists but no user yet
    currentUser: initialUser,
};

const reducer = (state = initialState, action) => {
    if (action.type === actionTypes.LOGIN_USER) {
        if (action.token) {
            // Store token in both keys for compatibility
            localStorage.setItem('token', action.token);
            localStorage.setItem('auth_token', action.token);
            // Also store user data as fallback
            if (action.currentUser) {
                localStorage.setItem('user', JSON.stringify(action.currentUser));
            }
        }  
        return {
            ...state,
            isLoggedIn: true,
            currentUser: action.currentUser
        };
    }

    if (action.type === actionTypes.LOGOUT_USER) {
        localStorage.removeItem('token');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        return {
            ...state,
            isLoggedIn: false,
            currentUser: null
        };
    }
    if (action.type === actionTypes.LOAD_USER) {
        return {
            ...state,
            currentUser: action.currentUser
        };
    }
    if (action.type === actionTypes.AUTH_LOADING) {
        return {
            ...state,
            isAuthLoading: action.loading
        };
    }
    return { ...state };
};

export default reducer;