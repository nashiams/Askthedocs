import { useState, useCallback, useEffect } from "react";
import { UserInfo } from "@/types/frontend/chat";

export function useUserInfo() {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const getUserInfo = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/session");
      const data: { user?: UserInfo } = await response.json();
      if (data?.user) {
        setUserInfo(data.user);
      }
    } catch (error) {
      console.error("Failed to get user info:", error);
    }
  }, []);

  useEffect(() => {
    getUserInfo();
  }, [getUserInfo]);

  return { userInfo, getUserInfo };
}