import { useEffect } from 'react';
import Router from "./route/Index";
import { ToastContainer } from 'react-toastify';
import { Capacitor } from '@capacitor/core';
import OneSignalService from './services/OneSignalService';
import { initializeSampleTickets } from './helpers/SampleTicketsData';

const App = () => {
  useEffect(() => {
    // Initialize sample tickets data
    initializeSampleTickets();
    
    // Initialize OneSignal push notifications on mobile devices
    if (Capacitor.isNativePlatform()) {
      OneSignalService.initialize();
    }
  }, []);

  return (
    <>
      <Router />
      <ToastContainer />
    </>
  );
}

export default App;
