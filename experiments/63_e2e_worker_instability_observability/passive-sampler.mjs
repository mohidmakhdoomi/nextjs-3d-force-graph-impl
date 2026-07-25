import {execFile} from "node:child_process";
import {appendFile, mkdir, readFile, readdir} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {clearInterval, setInterval, setTimeout} from "node:timers";
import {promisify} from "node:util";

const execFileAsync = promisify(execFile);
const outputDir = process.argv[2];
const intervalMs = Number(process.argv[3] ?? "1000");

if (outputDir === undefined || !Number.isFinite(intervalMs) || intervalMs < 250) {
    throw new Error("Usage: node passive-sampler.mjs OUTPUT_DIR [INTERVAL_MS>=250]");
}

await mkdir(outputDir, {recursive: true});

const hostPath = path.join(outputDir, "host.jsonl");
const processPath = path.join(outputDir, "processes.jsonl");
const gpuPath = path.join(outputDir, "gpu.jsonl");
const startedAt = process.hrtime.bigint();
let sampleNumber = 0;
let sampling = false;
let stopped = false;

function parseKeyValueLines(value) {
    return Object.fromEntries(
        value
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                const [key, ...parts] = line.trim().split(/\s+/);
                return [key.replace(/:$/, ""), parts.join(" ")];
            }),
    );
}

function parsePressure(value) {
    return Object.fromEntries(
        value
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => {
                const [kind, ...metrics] = line.split(/\s+/);
                return [
                    kind,
                    Object.fromEntries(
                        metrics.map((metric) => {
                            const [key, rawValue] = metric.split("=");
                            return [key, Number(rawValue)];
                        }),
                    ),
                ];
            }),
    );
}

async function readOptional(filePath) {
    try {
        return await readFile(filePath, "utf8");
    } catch {
        return null;
    }
}

async function readThermals() {
    const thermalRoot = "/sys/class/thermal";
    let entries;
    try {
        entries = await readdir(thermalRoot, {withFileTypes: true});
    } catch {
        return [];
    }

    const zones = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("thermal_zone"));
    return Promise.all(
        zones.map(async (zone) => {
            const root = path.join(thermalRoot, zone.name);
            const [type, temp] = await Promise.all([
                readOptional(path.join(root, "type")),
                readOptional(path.join(root, "temp")),
            ]);
            return {
                zone: zone.name,
                type: type?.trim() ?? null,
                milliCelsius: temp === null ? null : Number(temp.trim()),
            };
        }),
    );
}

function eventBase(type) {
    return {
        type,
        timestamp: new Date().toISOString(),
        monotonicMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
        sampleNumber,
    };
}

async function sampleProcesses() {
    const {stdout} = await execFileAsync("ps", [
        "-eo",
        "pid=,ppid=,nlwp=,stat=,etimes=,pcpu=,pmem=,rss=,comm=,args=",
        "--sort=pid",
    ], {maxBuffer: 16 * 1024 * 1024});
    const relevant = stdout
        .split("\n")
        .filter((line) => /(playwright|chrom(?:e|ium)|firefox|next-server|next start|test:smoke)/i.test(line));

    await appendFile(
        processPath,
        `${JSON.stringify({...eventBase("process-snapshot"), rows: relevant})}\n`,
    );
}

async function sampleGpu() {
    if (process.env.E2E_EXPERIMENT_SAMPLE_GPU !== "1") {
        return;
    }

    try {
        const {stdout} = await execFileAsync("nvidia-smi", [
            "--query-gpu=name,driver_version,utilization.gpu,utilization.memory,memory.used,memory.total,temperature.gpu,power.draw",
            "--format=csv,noheader,nounits",
        ]);
        await appendFile(
            gpuPath,
            `${JSON.stringify({...eventBase("gpu-snapshot"), rows: stdout.trim().split("\n")})}\n`,
        );
    } catch (error) {
        await appendFile(
            gpuPath,
            `${JSON.stringify({...eventBase("gpu-error"), message: error.message})}\n`,
        );
    }
}

async function sample() {
    if (sampling || stopped) {
        return;
    }

    sampling = true;
    sampleNumber += 1;
    try {
        const [loadavg, meminfo, cpuPressure, memoryPressure, ioPressure, procStat, thermals] =
            await Promise.all([
                readOptional("/proc/loadavg"),
                readOptional("/proc/meminfo"),
                readOptional("/proc/pressure/cpu"),
                readOptional("/proc/pressure/memory"),
                readOptional("/proc/pressure/io"),
                readOptional("/proc/stat"),
                readThermals(),
            ]);

        const loadParts = loadavg?.trim().split(/\s+/) ?? [];
        const [running, schedulable] = (loadParts[3] ?? "/").split("/").map(Number);
        const memory = meminfo === null ? {} : parseKeyValueLines(meminfo);
        const cpuLine = procStat?.split("\n").find((line) => line.startsWith("cpu "));

        await appendFile(
            hostPath,
            `${JSON.stringify({
                ...eventBase("host-snapshot"),
                load: {
                    oneMinute: Number(loadParts[0]),
                    fiveMinutes: Number(loadParts[1]),
                    fifteenMinutes: Number(loadParts[2]),
                    running,
                    schedulable,
                },
                memory: {
                    memTotal: memory.MemTotal,
                    memAvailable: memory.MemAvailable,
                    swapTotal: memory.SwapTotal,
                    swapFree: memory.SwapFree,
                    dirty: memory.Dirty,
                    writeback: memory.Writeback,
                },
                pressure: {
                    cpu: cpuPressure === null ? null : parsePressure(cpuPressure),
                    memory: memoryPressure === null ? null : parsePressure(memoryPressure),
                    io: ioPressure === null ? null : parsePressure(ioPressure),
                },
                cpuJiffies: cpuLine?.trim().split(/\s+/).slice(1).map(Number) ?? [],
                thermals,
                osLoadAverage: os.loadavg(),
                osFreeMemory: os.freemem(),
            })}\n`,
        );

        if (sampleNumber % 2 === 1) {
            await Promise.all([sampleProcesses(), sampleGpu()]);
        }
    } catch (error) {
        await appendFile(
            hostPath,
            `${JSON.stringify({...eventBase("sample-error"), message: error.message})}\n`,
        );
    } finally {
        sampling = false;
    }
}

async function stop() {
    if (stopped) {
        return;
    }
    stopped = true;
    clearInterval(timer);
    while (sampling) {
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    process.exit(0);
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await sample();
const timer = setInterval(sample, intervalMs);
