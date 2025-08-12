import { useEffect, useState } from 'react';
import Ably from 'ably';

export function useAbly(channelName: string, onMessage: (message: any) => void) {
  const [client, setClient] = useState<Ably.Realtime | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let ably: Ably.Realtime | null = null;
    let channel: Ably.RealtimeChannel | null = null;

    const connect = async () => {
      try {
        const tokenResponse = await fetch('/api/docs/ably-token');
        const tokenRequest = await tokenResponse.json();
        
        ably = new Ably.Realtime({
          authCallback: (params, callback) => {
            callback(null, tokenRequest);
          }
        });
        
        ably.connection.on('connected', () => {
          setIsConnected(true);
        });
        
        ably.connection.on('disconnected', () => {
          setIsConnected(false);
        });
        
        channel = ably.channels.get(channelName);
        channel.subscribe(onMessage);
        
        setClient(ably);
      } catch (error) {
        console.error('Failed to connect to Ably:', error);
      }
    };

    connect();

    return () => {
      if (channel) {
        channel.unsubscribe();
      }
      if (ably) {
        ably.close();
      }
    };
  }, [channelName]);

  return { client, isConnected };
}