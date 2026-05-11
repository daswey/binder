import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL ?? '/', { auth: { token }, transports: ['websocket'] });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

export function useSocket(token: string | null) {
  const ref = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;
    ref.current = getSocket(token);
    return () => {};
  }, [token]);

  return ref.current;
}
