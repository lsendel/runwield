import { assert, assertEquals } from "@std/assert";

// ─── Tests for the generation-gating helper pattern used in chat-session.js ───

/**
 * Simulates the generation-gating pattern:
 * - operationGeneration is a monotonically increasing counter
 * - Each new operation increments it before starting
 * - generationStillCurrent(gen) returns false if a newer operation has started
 */
function createGenerationGuard() {
    let operationGeneration = 0;

    function bumpGeneration() {
        return ++operationGeneration;
    }

    /** @param {number} gen */
    function generationStillCurrent(gen) {
        return gen === operationGeneration;
    }

    return { bumpGeneration, generationStillCurrent };
}

Deno.test("generationStillCurrent returns true before any bump", () => {
    const { bumpGeneration, generationStillCurrent } = createGenerationGuard();
    // Initial generation is 0
    assertEquals(generationStillCurrent(0), true);
    // After bump, generation 0 is stale
    bumpGeneration();
    assertEquals(generationStillCurrent(0), false);
});

Deno.test("generationStillCurrent returns true for current, false for stale", () => {
    const { bumpGeneration, generationStillCurrent } = createGenerationGuard();
    const gen1 = bumpGeneration(); // gen1 = 1
    assertEquals(generationStillCurrent(gen1), true);

    const gen2 = bumpGeneration(); // gen2 = 2
    assertEquals(generationStillCurrent(gen1), false); // gen1 is stale
    assertEquals(generationStillCurrent(gen2), true); // gen2 is current
});

Deno.test("multiple bumps invalidate all previous generations", () => {
    const { bumpGeneration, generationStillCurrent } = createGenerationGuard();
    const generations = [bumpGeneration(), bumpGeneration(), bumpGeneration()];
    // Only the last one should be current
    assertEquals(generationStillCurrent(generations[0]), false);
    assertEquals(generationStillCurrent(generations[1]), false);
    assertEquals(generationStillCurrent(generations[2]), true);
});

Deno.test("late result suppression pattern works correctly", async () => {
    const { bumpGeneration, generationStillCurrent } = createGenerationGuard();
    /** @type {string[]} */
    const results = [];

    // Simulate starting an operation
    const gen = bumpGeneration();

    // Simulate user pressing Esc BEFORE the async completes
    // (this bumps the generation, making `gen` stale)
    bumpGeneration();

    // Now simulate the async operation completing
    await new Promise((resolve) => {
        /** @type {() => void} */
        const r = /** @type {() => void} */ (resolve);
        setTimeout(() => {
            if (generationStillCurrent(gen)) {
                results.push("completed");
            }
            r();
        }, 50);
    });

    // Result should be suppressed because generation changed
    assertEquals(results.length, 0);
});

Deno.test("completed result is accepted when not canceled", async () => {
    const { bumpGeneration, generationStillCurrent } = createGenerationGuard();
    /** @type {string[]} */
    const results = [];

    const gen = bumpGeneration();

    await new Promise((resolve) => {
        /** @type {() => void} */
        const r = /** @type {() => void} */ (resolve);
        setTimeout(() => {
            if (generationStillCurrent(gen)) {
                results.push("completed");
            }
            r();
        }, 10);
    });

    // Don't bump generation — let it complete naturally
    assertEquals(results, ["completed"]);
});

// ─── Tests for cancel callback pattern ───

/** Simulates the cancel flow from chat-session.js */
function tryCancelOperation(/** @type {(() => void) | null} */ cancelFn) {
    if (cancelFn) {
        try {
            cancelFn();
        } catch (_e) {
            // Ignore cancel errors — cancellation should always succeed from caller's perspective
        }
        return true;
    }
    return false;
}

Deno.test("cancel callback is called and cleared", () => {
    let cancelCalled = false;
    /** @type {(() => void) | null} */
    let activeOperationCancel = () => {
        cancelCalled = true;
    };

    const canceled = tryCancelOperation(activeOperationCancel);
    activeOperationCancel = null;

    assert(canceled);
    assert(cancelCalled);
    assertEquals(activeOperationCancel, null);
});

Deno.test("cancel is idempotent — second cancel is no-op", () => {
    let cancelCount = 0;
    /** @type {(() => void) | null} */
    let activeOperationCancel = () => {
        cancelCount++;
    };

    // First cancel
    const first = tryCancelOperation(activeOperationCancel);
    activeOperationCancel = null;
    assert(first);
    assertEquals(cancelCount, 1);

    // Second cancel attempt (should be no-op since cancelFn is null)
    const second = tryCancelOperation(activeOperationCancel);
    assert(!second);
    assertEquals(cancelCount, 1); // Still 1
});

Deno.test("cancel callback that throws does not crash the flow", () => {
    /** @type {(() => void) | null} */
    let activeOperationCancel = () => {
        throw new Error("boom");
    };

    // Should not throw
    const canceled = tryCancelOperation(activeOperationCancel);
    activeOperationCancel = null;

    assert(canceled);
    assertEquals(activeOperationCancel, null);
});

// ─── Tests for bash process kill pattern ───

Deno.test("bash process kill flag is set on cancel", () => {
    let wasCanceled = false;
    /** @type {{ kill?: () => void, pid?: number } | null} */
    let activeBashProc = {
        kill: () => {
            wasCanceled = true;
        },
    };

    // Simulate cancel
    if (activeBashProc) {
        try {
            if (activeBashProc.kill) activeBashProc.kill();
        } catch (_e) {
            // Ignore kill errors
        }
        activeBashProc = null;
    }

    assert(wasCanceled);
    assertEquals(activeBashProc, null);
});

Deno.test("output append is skipped after bash cancel", () => {
    let wasCanceled = false;
    let outputBuffer = "";

    // Simulate receiving output before cancel
    if (!wasCanceled) {
        outputBuffer += "some output";
    }

    // Now cancel
    wasCanceled = true;

    // Simulate receiving more output after cancel
    if (!wasCanceled) {
        outputBuffer += " more output";
    }

    assertEquals(outputBuffer, "some output"); // No additional output after cancel
});
