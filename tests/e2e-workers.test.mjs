// Unit coverage for the pure local-worker resolution contract (issue #41 FR8).
//
// Everything here drives the pure `resolveWorkers(env)` directly with literal
// env objects — no Playwright, no `process.env` mutation, no I/O. The function's
// return value IS the contract; these rows are the spec FR8 matrix made
// executable, plus explicit negative rows locking the leading-zero / exponent /
// decimal disposition called out as a risk in the plan.
import assert from "node:assert/strict";
import test from "node:test";

import {
    DEFAULT_LOCAL_WORKERS,
    WorkerConfigError,
    resolveWorkers,
} from "../scripts/e2e-workers.mjs";

test("DEFAULT_LOCAL_WORKERS is serial 1 (Phase-3 qualification flipped it from parallel)", () => {
    assert.strictEqual(DEFAULT_LOCAL_WORKERS, 1);
});

test("CI guard: CI set ⇒ serial 1 (the number, not a string)", () => {
    assert.strictEqual(resolveWorkers({CI: "1"}), 1);
    assert.strictEqual(resolveWorkers({CI: "true"}), 1);
});

test("CI precedence: CI wins over E2E_WORKERS", () => {
    assert.strictEqual(resolveWorkers({CI: "1", E2E_WORKERS: "4"}), 1);
    assert.strictEqual(resolveWorkers({CI: "true", E2E_WORKERS: "50%"}), 1);
    // Even a value that would otherwise throw never surfaces under CI, because
    // the CI guard returns before E2E_WORKERS is read.
    assert.strictEqual(resolveWorkers({CI: "1", E2E_WORKERS: "abc"}), 1);
});

test("E2E_WORKERS positive integer ⇒ that number", () => {
    assert.strictEqual(resolveWorkers({E2E_WORKERS: "4"}), 4);
    assert.strictEqual(resolveWorkers({E2E_WORKERS: "1"}), 1);
    assert.strictEqual(resolveWorkers({E2E_WORKERS: "16"}), 16);
});

test("E2E_WORKERS percentage ⇒ that percentage string (passed to Playwright)", () => {
    assert.strictEqual(resolveWorkers({E2E_WORKERS: "50%"}), "50%");
    assert.strictEqual(resolveWorkers({E2E_WORKERS: "100%"}), "100%");
    assert.strictEqual(resolveWorkers({E2E_WORKERS: "25%"}), "25%");
});

test("default: no CI, no E2E_WORKERS ⇒ serial 1 (parallel is opt-in via E2E_WORKERS)", () => {
    assert.strictEqual(resolveWorkers({}), DEFAULT_LOCAL_WORKERS);
    assert.strictEqual(resolveWorkers({}), 1);
});

test("empty / whitespace E2E_WORKERS is treated as unset ⇒ serial default", () => {
    assert.strictEqual(resolveWorkers({E2E_WORKERS: ""}), 1);
    assert.strictEqual(resolveWorkers({E2E_WORKERS: "   "}), 1);
});

test("surrounding whitespace is trimmed before matching", () => {
    assert.strictEqual(resolveWorkers({E2E_WORKERS: " 4 "}), 4);
    assert.strictEqual(resolveWorkers({E2E_WORKERS: "\t50%\n"}), "50%");
});

test("empty CI value is falsy ⇒ CI guard doesn't fire; E2E_WORKERS opt-in still applies", () => {
    // The truthy check mirrors the config's `process.env.CI ? … : …` idiom: an
    // unset/empty CI must NOT trigger the CI guard, so a local E2E_WORKERS opt-in
    // still takes effect (and absent one, the serial default applies).
    assert.strictEqual(resolveWorkers({CI: "", E2E_WORKERS: "4"}), 4);
    assert.strictEqual(resolveWorkers({CI: ""}), 1);
    assert.strictEqual(resolveWorkers({CI: undefined}), 1);
});

// --- Malformed values: loud WorkerConfigError, never a silent fallback ------

const INVALID_VALUES = [
    "0", // zero is not a positive worker count
    "0%", // zero percent
    "-1", // negative
    "abc", // non-numeric
    "12x", // trailing garbage
    "1.5", // decimal
    "%", // bare percent
    "01", // leading zero (disposition: rejected)
    "1e2", // exponent form (disposition: rejected)
    "50 %", // internal whitespace in a percentage
    "4.0", // decimal integer
    "0x10", // hex
    "  %  ", // whitespace around a bare percent
];

for (const value of INVALID_VALUES) {
    test(`E2E_WORKERS=${JSON.stringify(value)} ⇒ throws WorkerConfigError`, () => {
        assert.throws(
            () => resolveWorkers({E2E_WORKERS: value}),
            WorkerConfigError,
        );
    });
}

test("WorkerConfigError message names the offending value and accepted forms", () => {
    try {
        resolveWorkers({E2E_WORKERS: "12x"});
        assert.fail("expected resolveWorkers to throw");
    } catch (error) {
        assert.ok(error instanceof WorkerConfigError);
        assert.match(error.message, /12x/); // names the offending value
        assert.match(error.message, /positive integer/);
        assert.match(error.message, /percentage/);
    }
});

test("WorkerConfigError is a subclass of Error", () => {
    assert.ok(new WorkerConfigError("x") instanceof Error);
});
