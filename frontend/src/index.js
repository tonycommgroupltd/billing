import React from "react";
import ReactDOM from "react-dom";
import { BrowserRouter } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

import "./assets/scss/dashlite.scss";
import "./assets/scss/style-email.scss";
import "./App.css";

import App from "./App";
import reportWebVitals from "./reportWebVitals";
import store from "./store";
import { Provider } from "react-redux";

import { history, http } from "./helpers";
import ActionTypes from "./store/action-types";

let token = localStorage.getItem("token");

const logout = () => {
  localStorage.removeItem("token");

  store.dispatch({
    type: ActionTypes.LOGOUT_USER,
  });

  history.push("/login");
};

if (token) {
  try {
    const decoded = jwtDecode(token);

    // Check expiration
    if (decoded.exp * 1000 < Date.now()) {
      logout();
      token = null;
    }
  } catch (e) {
    logout();
    token = null;
  }
}

const render = () => {
  ReactDOM.render(
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>,
    document.getElementById("root")
  );
};

if (token) {
  http
    .get("/user-profile")
    .then((res) => {
      store.dispatch({
        type: ActionTypes.LOGIN_USER,
        currentUser: res.data,
      });

      render();
    })
    .catch(() => {
      logout();
      render();
    });
} else {
  render();
}

reportWebVitals();