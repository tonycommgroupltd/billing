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

export const registerWithJWT = (values, resetForm, navigate) => (dispatch) => {
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

    const successToast = (placement, message) => {
        toast.success(message, {
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
    http
        .post("/register", {
            name: values.name,
            phone: values.phone,
            email: values.email,
            password: values.password,
            password_confirmation: values.passwordRetype
        })
        .then(response => {
            dispatch({ type: actionTypes.AUTH_LOADING, loading: false });
            successToast("bottom-center", "Registration completed successfully");
            resetForm();
            navigate("/login")
        })
        .catch(err => {
            if (err.response.status === 422) {
                execToast("top-right", err.response.data[Object.keys(err.response.data)[0]][0]);
            } else {
                execToast("top-right", 'Something went wrong');
            }
            dispatch({ type: actionTypes.AUTH_LOADING, loading: false });
        })

}

export default registerWithJWT;