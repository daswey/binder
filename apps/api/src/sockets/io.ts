import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';

let io: SocketServer | null = null;

export function initIO(server: any) {
  io = new SocketServer(server, {
    cors: { origin: process.env.FRONTEND_URL ?? '*', credentials: true },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as { sub: string };
      (socket as any).userId = payload.sub;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = (socket as any).userId as string;
    socket.join(`user:${userId}`);

    socket.on('join_conversation', (convId: string) => {
      socket.join(`conv:${convId}`);
    });

    socket.on('leave_conversation', (convId: string) => {
      socket.leave(`conv:${convId}`);
    });
  });

  return io;
}

export function getIO() {
  return io;
}
