import { spawn, ChildProcess } from 'child_process';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '../../../..');

export interface ServiceProcess {
  name: string;
  process: ChildProcess;
  port: number;
}

const services: ServiceProcess[] = [];

/**
 * Check if Neo4j is running
 */
export async function checkNeo4j(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('docker compose ps neo4j', {
      cwd: ROOT_DIR,
    });
    return stdout.includes('Up');
  } catch {
    return false;
  }
}

/**
 * Start Neo4j if not running
 */
export async function startNeo4j(): Promise<void> {
  const isRunning = await checkNeo4j();
  if (isRunning) {
    console.log('Neo4j is already running');
    return;
  }

  console.log('Starting Neo4j...');
  await execAsync('docker compose up -d neo4j', { cwd: ROOT_DIR });
  
  // Wait for Neo4j to be ready
  let retries = 30;
  while (retries > 0) {
    try {
      const response = await fetch('http://localhost:7474');
      if (response.ok) {
        console.log('Neo4j is ready');
        return;
      }
    } catch {
      // Not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    retries--;
  }
  throw new Error('Neo4j failed to start within 30 seconds');
}

/**
 * Wait for a service to be healthy by polling a URL
 */
export async function waitForService(
  url: string,
  timeout: number = 30000
): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Service not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Service at ${url} failed to become healthy within ${timeout}ms`);
}

/**
 * Start core service
 */
export async function startCoreService(): Promise<ServiceProcess> {
  console.log('Starting core service...');
  // Always run in headless mode for e2e tests
  const env = {
    ...process.env,
    HEADLESS: 'true',
  };
  const childProcess = spawn('yarn', ['workspace', '@dav-ai/core', 'dev:server'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    shell: true,
    env,
  });

  const service: ServiceProcess = {
    name: 'core',
    process: childProcess,
    port: 3002,
  };

  services.push(service);
  await waitForService('http://localhost:3002/health', 60000);
  console.log('Core service is ready');
  return service;
}

/**
 * Start frontend BFF service
 */
export async function startFrontend(): Promise<ServiceProcess> {
  console.log('Starting frontend service...');
  const process = spawn('yarn', ['workspace', '@dav-ai/frontend', 'dev:server'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    shell: true,
  });

  const service: ServiceProcess = {
    name: 'frontend',
    process,
    port: 3001,
  };

  services.push(service);
  await waitForService('http://localhost:3001/api/health', 60000);
  console.log('Frontend service is ready');
  return service;
}

/**
 * Start test-app
 */
export async function startTestApp(): Promise<ServiceProcess> {
  console.log('Starting test-app...');
  const process = spawn('yarn', ['workspace', '@dav-ai/test-app', 'dev'], {
    cwd: ROOT_DIR,
    stdio: 'pipe',
    shell: true,
  });

  const service: ServiceProcess = {
    name: 'test-app',
    process,
    port: 5173,
  };

  services.push(service);
  await waitForService('http://localhost:5173', 60000);
  console.log('Test-app is ready');
  return service;
}

/**
 * Stop all services
 */
export async function stopAllServices(): Promise<void> {
  console.log('Stopping all services...');
  const stopPromises = services.map((service) => {
    return new Promise<void>((resolve) => {
      if (service.process.killed) {
        resolve();
        return;
      }

      service.process.on('exit', () => resolve());
      service.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (!service.process.killed) {
          service.process.kill('SIGKILL');
          resolve();
        }
      }, 5000);
    });
  });

  await Promise.all(stopPromises);
  services.length = 0;
  console.log('All services stopped');
}

