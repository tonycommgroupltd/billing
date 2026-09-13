import { useEffect } from 'react';

const HOTSPOT_ADMIN_URL = 'https://mwananchi.tcom.co.ke/admin/index.php';

const HotspotRedirect = () => {
  useEffect(() => {
    window.location.replace(HOTSPOT_ADMIN_URL);
  }, []);

  return (
    <div className="nk-content-body text-center py-5">
      <p className="text-soft">Opening Hotspot Admin…</p>
      <p className="small">
        <a href={HOTSPOT_ADMIN_URL}>Click here</a> if you are not redirected.
      </p>
    </div>
  );
};

export default HotspotRedirect;
