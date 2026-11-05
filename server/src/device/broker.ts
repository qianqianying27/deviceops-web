import { createRequire } from 'node:module';
import net from 'node:net';
import { logger } from '../utils/logger.js';

const require = createRequire(import.meta.url);

interface AedesInstance {
  handle: (client: unknown) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  close: () => Promise<void>;
}

/**
 * 内置 MQTT Broker（Aedes）：让项目 clone 下来无需安装 Mosquitto 即可跑通设备链路。
 * 生产环境把 MQTT_URL 指向真实 Broker 即可，入站层代码不变。
 */
export async function startEmbeddedBroker(port: number): Promise<net.Server | null> {
  const factory = require('aedes') as () => AedesInstance;
  const broker = factory();
  const server = net.createServer(broker.handle);

  broker.on('client', () => logger.info('mqtt', `设备接入 ${new Date().toLocaleTimeString('zh-CN')}`));
  broker.on('clientError', () => logger.warn('mqtt', '设备连接异常'));

  return await new Promise((resolve) => {
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn('mqtt', `端口 ${port} 已被占用，沿用外部 Broker`);
        resolve(null);
      } else {
        throw err;
      }
    });
    server.listen(port, () => {
      logger.info('mqtt', `内置 Broker 监听 ${port}`);
      resolve(server);
    });
  });
}

export async function stopBroker(server: net.Server | null): Promise<void> {
  if (!server) return;
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
