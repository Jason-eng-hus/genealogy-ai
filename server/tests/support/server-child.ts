import { startServer } from '../../src/main.ts';

const started = await startServer();

process.stdout.write(`READY ${started.port}\n`);

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  if (!chunk.includes('SHUTDOWN')) {
    return;
  }

  process.stdin.pause();
  process.stdin.destroy();
  process.emit('SIGINT', 'SIGINT');

  void started.shutdown('child-exit').then(
    () => {
      process.exit(0);
    },
    () => {
      process.exit(1);
    },
  );
});
