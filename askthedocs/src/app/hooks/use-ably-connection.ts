import { useRef, useCallback, useEffect } from "react";
import Ably from "ably";
import { CrawlProgressData } from "@/types/frontend/chat";

export function useAblyConnection(
  userEmail: string | null,
  handleCrawlProgress: (data: CrawlProgressData) => void
) {
  const ablyRef = useRef<Ably.Realtime | null>(null);

  const initializeAbly = useCallback(async (userEmail: string) => {
    if (!userEmail) {
      console.error("Cannot initialize Ably without user email");
      return;
    }

    try {
      const tokenResponse = await fetch("/api/docs/ably-token");
      const tokenRequest = await tokenResponse.json();
      
      const ably = new Ably.Realtime({
        authCallback: (params, callback) => {
          callback(null, tokenRequest);
        }
      });
      
      ablyRef.current = ably;
      
      // Subscribe to the user's channel
      const channel = ably.channels.get(`crawl-${userEmail}`);
      
      channel.subscribe("progress", (message) => {
        console.log("Progress update received:", message.data);
        handleCrawlProgress(message.data as CrawlProgressData);
      });

      ably.connection.on('connected', () => {
        console.log(`Ably connected for channel: crawl-${userEmail}`);
      });

      ably.connection.on('failed', (error) => {
        console.error('Ably connection failed:', error);
      });
    } catch (error) {
      console.error("Failed to initialize Ably:", error);
    }
  }, [handleCrawlProgress]);

  useEffect(() => {
    if (userEmail) {
      initializeAbly(userEmail);
    }
  }, [userEmail, initializeAbly]);

  useEffect(() => {
    return () => {
      // Only cleanup if component unmounts, not on every render
      if (ablyRef.current) {
        ablyRef.current.close();
        ablyRef.current = null;
      }
    };
  }, []); // Empty dependency array - only on unmount

  return ablyRef;
}