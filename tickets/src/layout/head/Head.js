import React from "react";
import { Helmet } from "react-helmet";

const Head = ({ ...props }) => {
  return (
    <Helmet>
      <title>{process.env.REACT_APP_SITE_TITLE}{props.title ?  ": " + props.title : null}</title>
    </Helmet>
  );
};
export default Head;
