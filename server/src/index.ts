import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { seedDatabase } from './db/seed.js';
import { startEmbeddedBroker, stopBroker } from './device/broker.js';
import { startIngest } from './device/ingest.js';
import { startSimulator } from './device/simulator.js';
import { initPublisher, closePublisher } from './device/publisher.js';
import { attachRealtime, closeRealtime } from './realtime/hub.js';
import { logger } from './utils/logger.js';

async function main() {
  seedDatabase();

  const app = createApp();
  const server = http.createServer(app);
  attachRealtime(server);

  const brokerServer = await startEmbeddedBroker(config.mqttPort);
  initPublisher();
  const ingest = startIngest();
  const simulator = config.simulate ? startSimulator() : { stop: () => undefined };

  server.listen(config.port, () => {
    logger.info('api', `HTTP 服务 http://127.0.0.1:${config.port}`);
    logger.info('api', '演示账号：admin / operator / viewer，密码 demo1234');
    logger.info('api', config.simulate ? '模拟设备已启动（SIMULATE=0 可关闭）' : '模拟设备未启动');
  });

  const shutdown = async () => {
    logger.info('api', '正在关闭服务…');
    simulator.stop();
    ingest.stop();
    closePublisher();
    closeRealtime();
    await stopBroker(brokerServer);
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  logger.error('api', '启动失败', err);
  process.exit(1);
});
