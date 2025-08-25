import { useState } from "react";
import { checkAuth } from "@/lib/auth/check-auth";
import { UserInfo } from "@/types/frontend/home";

export function useAuthentication() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const checkAuthStatus = async () => {
    setIsCheckingAuth(true);
    
    try {
      const isLoggedIn = await checkAuth();
      
      if (isLoggedIn) {
        const response = await fetch("/api/auth/session");
        const data = await response.json();
        
        if (data?.user) {
          setIsAuthenticated(true);
          setUserInfo(data.user);
        } else {
          setIsAuthenticated(false);
        }
      } else {
        setIsAuthenticated(false);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
      setIsAuthenticated(false);
    }
    
    setIsCheckingAuth(false);
  };

  return {
    isAuthenticated,
    userInfo,
    isCheckingAuth,
    checkAuthStatus
  };
}