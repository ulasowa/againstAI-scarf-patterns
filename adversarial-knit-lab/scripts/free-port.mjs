/**
 * Release a TCP port before starting a test server.
 *
 * The browser suite never reuses an existing server, because a stale one
 * serves a stale build. But a run that was interrupted can leave its preview
 * server behind, and then the next run waits on a port that is answering with
 * yesterday's code instead of failing fast.
 *
 * Best effort: if the platform has no `lsof`, this does nothing and the server
 * start reports the conflict itself.
 */
import { execFileSync } from 'node:child_process'

const port = Number(process.argv[2])
if (!Number.isInteger(port)) {
  console.error('usage: node scripts/free-port.mjs <port>')
  process.exit(1)
}

try {
  const output = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' })
  const pids = output.split('\n').map((line) => line.trim()).filter(Boolean)
  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL')
      console.log(`freed port ${port} (killed pid ${pid})`)
    } catch {
      // Already gone, or not ours to kill.
    }
  }
} catch {
  // Nothing listening, or no lsof on this platform. Either way, carry on.
}
