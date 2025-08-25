import { useRef, useCallback, useEffect } from "react";
import Ably from "ably";
import { CrawlProgressData } from "@/types/frontend/chat";

export function useAblyConnection(
  userEmail: string | null,
  handleCrawlProgress: (data: CrawlProgressData) => void,
  shouldConnect: boolean = false, // Add conditional connection
  autoDisconnect: boolean = true, // Add auto-disconnect
  disconnectOn: string[] = ["complete", "error"] // Statuses that trigger disconnect
) {
  const ablyRef = useRef<Ably.Realtime | null>(null);

  const disconnect = useCallback(() => {
    if (ablyRef.current) {
      console.log("Disconnecting Ably...");
      ablyRef.current.close();
      ablyRef.current = null;
    }
  }, []);

  const initializeAbly = useCallback(async (userEmail: string) => {
    if (!userEmail) {
      console.error("Cannot initialize Ably without user email");
      return;
    }
    
    // Don't create duplicate connections
    if (ablyRef.current) {
      console.log("Ably already connected");
      return;
    }

    try {
      const tokenResponse = await fetch("/api/docs/ably-token");
      const tokenRequest = await tokenResponse.json();
      
      const ably = new Ably.Realtime({
        authCallback: (params, callback) => {
          callback(null, tokenRequest);
        },
        closeOnUnload: true, // Close connection when page unloads
        autoConnect: true, // Connect automatically
        echoMessages: false, // Don't receive messages you publish
      });
      
      ablyRef.current = ably;
      
      // Subscribe to the user's channel
      const channel = ably.channels.get(`crawl-${userEmail}`);
      
      channel.subscribe("progress", (message) => {
        console.log("Progress update received:", message.data);
        handleCrawlProgress(message.data as CrawlProgressData);
        
        // Auto-disconnect on completion or error
        if (autoDisconnect && disconnectOn.includes(message.data.status)) {
          console.log(`Auto-disconnecting due to status: ${message.data.status}`);
          setTimeout(() => disconnect(), 1000); // Small delay to ensure message is processed
        }
      });

      ably.connection.on('connected', () => {
        console.log(`Ably connected for channel: crawl-${userEmail}`);
      });

      ably.connection.on('failed', (error) => {
        console.error('Ably connection failed:', error);
        disconnect(); // Clean up on failure
      });
    } catch (error) {
      console.error("Failed to initialize Ably:", error);
    }
  }, [handleCrawlProgress, autoDisconnect, disconnectOn, disconnect]);

  useEffect(() => {
    // Only connect when shouldConnect is true
    if (userEmail && shouldConnect) {
      initializeAbly(userEmail);
    } else if (!shouldConnect && ablyRef.current) {
      // Disconnect when shouldConnect becomes false
      disconnect();
    }
  }, [userEmail, shouldConnect, initializeAbly, disconnect]);

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