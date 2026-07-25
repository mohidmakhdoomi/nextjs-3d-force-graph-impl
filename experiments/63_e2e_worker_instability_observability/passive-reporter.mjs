import {closeSync, mkdirSync, openSync, writeSync} from "node:fs";
import path from "node:path";

const outputPath = process.env.E2E_EXPERIMENT_EVENTS;

function serializeError(error) {
    if (error === undefined) {
        return null;
    }

    return {
        message: error.message,
        stack: error.stack,
        value: error.value,
    };
}

export default class PassiveReporter {
    constructor() {
        if (outputPath === undefined) {
            throw new Error("E2E_EXPERIMENT_EVENTS must name the passive reporter output");
        }

        mkdirSync(path.dirname(outputPath), {recursive: true});
        this.fd = openSync(outputPath, "a");
        this.startedAt = process.hrtime.bigint();
        this.activeTests = 0;
        this.maxActiveTests = 0;
    }

    emit(type, fields = {}) {
        const monotonicMs = Number(process.hrtime.bigint() - this.startedAt) / 1_000_000;
        writeSync(
            this.fd,
            `${JSON.stringify({
                type,
                timestamp: new Date().toISOString(),
                monotonicMs,
                ...fields,
            })}\n`,
        );
    }

    onBegin(config, suite) {
        this.emit("run-begin", {
            configuredWorkers: config.workers,
            projects: config.projects.map((project) => project.name),
            totalTests: suite.allTests().length,
        });
    }

    onTestBegin(test, result) {
        this.activeTests += 1;
        this.maxActiveTests = Math.max(this.maxActiveTests, this.activeTests);
        this.emit("test-begin", {
            testId: test.id,
            titlePath: test.titlePath(),
            project: test.parent.project()?.name,
            location: test.location,
            retry: result.retry,
            workerIndex: result.workerIndex,
            parallelIndex: result.parallelIndex,
            activeTests: this.activeTests,
            maxActiveTests: this.maxActiveTests,
        });
    }

    onTestEnd(test, result) {
        this.activeTests = Math.max(0, this.activeTests - 1);
        this.emit("test-end", {
            testId: test.id,
            titlePath: test.titlePath(),
            project: test.parent.project()?.name,
            location: test.location,
            expectedStatus: test.expectedStatus,
            status: result.status,
            durationMs: result.duration,
            retry: result.retry,
            workerIndex: result.workerIndex,
            parallelIndex: result.parallelIndex,
            errors: result.errors.map(serializeError),
            attachments: result.attachments.map((attachment) => ({
                name: attachment.name,
                contentType: attachment.contentType,
                path: attachment.path,
                bodyBytes: attachment.body?.byteLength,
            })),
            activeTests: this.activeTests,
            maxActiveTests: this.maxActiveTests,
        });
    }

    onError(error) {
        this.emit("run-error", {error: serializeError(error)});
    }

    async onEnd(result) {
        this.emit("run-end", {
            status: result.status,
            durationMs: result.duration,
            activeTests: this.activeTests,
            maxActiveTests: this.maxActiveTests,
        });
        closeSync(this.fd);
    }

    onExit() {
        // Keep the reporter silent so the canonical reporter output remains the
        // human-readable failure record. onEnd normally closes the descriptor.
    }

    printsToStdio() {
        return false;
    }
}
