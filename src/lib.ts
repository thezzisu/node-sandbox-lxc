import path from 'path'
import { $, nothrow } from 'zx'

export async function findPodmanBinary () {
  const r = await nothrow($`which podman`)
  if (r.exitCode) throw new Error(r.stdout)
  return r.stdout
}

interface IPullOptions {
  image: string
}

export async function pull (options: IPullOptions) {
  await $`podman pull ${options.image}`
}

interface IVolume {
  host: string
  container: string
  options?: string
}

interface IRunOptions {
  image: string
  timeout?: number
  memory?: string
  cpus?: number
  pids?: number
  volumes?: IVolume[]
  cwd?: string
  command: string
  stdin?: string
  stdout?: string
  stderr?: string
}

interface IRunResult {
  status: 'ok' | 'timeout' | 'oom'
  exitCode: number
  time?: number
  memory?: number
}

export async function run (options: IRunOptions): Promise<IRunResult> {
  const args = ['--rm', '-i']
  if (options.timeout !== undefined) args.push(`--timeout=${options.timeout}`)
  if (options.memory !== undefined) args.push(`--memory=${options.memory}`, `--memory-swap=${options.memory}`)
  if (options.cpus !== undefined) args.push(`--cpus=${options.cpus}`)
  // Additional PID for the time process
  if (options.pids !== undefined) args.push(`--pids-limit=${options.pids + 1}`)
  if (options.volumes !== undefined) {
    for (const volume of options.volumes) {
      const host = path.resolve(volume.host)
      let arg = `-v=${host}:${volume.container}`
      if (volume.options !== undefined) arg += `:${volume.options}`
      args.push(arg)
    }
  }
  if (options.cwd !== undefined) args.push(`-w=${options.cwd}`)
  args.push(options.image)
  args.push('/usr/bin/time -f "%e %M"')
  args.push(`sh -c "${options.command} <${options.stdin || '/dev/null'} >${options.stdout || '/dev/null'} 2>${options.stderr || '/dev/null'}"`)
  const result = await nothrow($([`podman run ${args.join(' ')}`] as any))
  const info = result.stderr.trim()
  if (info) {
    const [time, memory] = info.split(' ').map(x => parseFloat(x))
    return {
      status: 'ok',
      exitCode: result.exitCode,
      time,
      memory
    }
  } else {
    return {
      status: result.exitCode === 137 ? 'oom' : 'timeout',
      exitCode: result.exitCode
    }
  }
}
