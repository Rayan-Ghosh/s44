import React, { createContext, useContext, useState } from "react";

interface AlertBadgeContextType {
  // Protection tab badge (call/security alert)
  protectionBadge: number;
  clearProtectionBadge: () => void;

  // Notification bell badge (guardian approval requests)
  notificationBadge: number;
  setNotificationBadge: (count: number) => void;
  clearNotificationBadge: () => void;
}

const AlertBadgeContext = createContext<AlertBadgeContextType>({
  protectionBadge: 1,
  clearProtectionBadge: () => {},
  notificationBadge: 0,
  setNotificationBadge: () => {},
  clearNotificationBadge: () => {},
});

export const AlertBadgeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [protectionBadge, setProtectionBadge] = useState<number>(1);
  const [notificationBadge, setNotificationBadge] = useState<number>(0);

  const clearProtectionBadge = () => setProtectionBadge(0);
  const clearNotificationBadge = () => setNotificationBadge(0);

  return (
    <AlertBadgeContext.Provider
      value={{
        protectionBadge,
        clearProtectionBadge,
        notificationBadge,
        setNotificationBadge,
        clearNotificationBadge,
      }}
    >
      {children}
    </AlertBadgeContext.Provider>
  );
};

export const useAlertBadge = (): AlertBadgeContextType =>
  useContext(AlertBadgeContext);
