import 'dotenv/config';
import path from 'node:path';

const llmBaseUrl = process.env.LLM_BASE_URL ?? '';

export const config = {
  port: Number(process.env.PORT ?? 3000),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  dbFile: process.env.DB_FILE ?? path.join('data', 'deviceops.db'),
  kbDir: process.env.KB_DIR ?? path.join('data', 'kb'),
  mqttPort: Number(process.env.MQTT_PORT ?? 1883),
  mqttUrl: process.env.MQTT_URL ?? `mqtt://127.0.0.1:${Number(process.env.MQTT_PORT ?? 1883)}`,
  simulate: process.env.SIMULATE !== '0',
  llm: {
    baseUrl: llmBaseUrl,
    apiKey: process.env.LLM_API_KEY ?? '',
    model: process.env.LLM_MODEL ?? 'qwen2.5-7b-instruct',
  },
};

export const llmEnabled = Boolean(config.llm.baseUrl && config.llm.apiKey);
