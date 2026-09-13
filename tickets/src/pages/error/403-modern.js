import React from "react";
import ErrorImage from "../../images/gfx/error-403.svg";
import PageContainer from "../../layout/page-container/PageContainer";
import { Block, BlockContent } from "../../components/Component";

const Error403Modern = () => {
  return (
    <PageContainer>
      <Block className="nk-block-middle wide-md mx-auto">
        <BlockContent className="nk-error-ld text-center">
          <img className="nk-error-gfx" src={ErrorImage} alt="error" />
          <div className="wide-xs mx-auto">
            <h3 className="nk-error-title">Forbidden</h3>
            <p className="nk-error-text">
              You dont have permission to access this resource.
            </p>
          </div>
        </BlockContent>
      </Block>
    </PageContainer>
  );
};
export default Error403Modern;
