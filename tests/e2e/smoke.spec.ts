import {expect, test, type Locator, type Page} from "@playwright/test";

type WebGLReadiness = {
    contextType: "webgl" | "webgl2" | null;
    cssWidth: number;
    cssHeight: number;
    canvasWidth: number;
    canvasHeight: number;
    drawingBufferWidth: number;
    drawingBufferHeight: number;
};

async function readWebGLReadiness(page: Page): Promise<WebGLReadiness | null> {
    return page.evaluate(() => {
        const canvasElement = document.querySelector("canvas");
        if (canvasElement === null) {
            return null;
        }

        const bounds = canvasElement.getBoundingClientRect();
        const webgl2 = canvasElement.getContext("webgl2");
        const context = webgl2 ?? canvasElement.getContext("webgl");

        return {
            contextType: context === null ? null : webgl2 === null ? "webgl" : "webgl2",
            cssWidth: bounds.width,
            cssHeight: bounds.height,
            canvasWidth: canvasElement.width,
            canvasHeight: canvasElement.height,
            drawingBufferWidth: context?.drawingBufferWidth ?? 0,
            drawingBufferHeight: context?.drawingBufferHeight ?? 0,
        };
    });
}

function isWebGLReady(readiness: WebGLReadiness | null): boolean {
    return (
        readiness !== null &&
        readiness.contextType !== null &&
        readiness.cssWidth > 0 &&
        readiness.cssHeight > 0 &&
        readiness.canvasWidth > 0 &&
        readiness.canvasHeight > 0 &&
        readiness.drawingBufferWidth > 0 &&
        readiness.drawingBufferHeight > 0
    );
}

async function hasSizedCanvas(page: Page): Promise<boolean> {
    return page.evaluate(() => {
        const canvas = document.querySelector("canvas");
        if (canvas === null) {
            return false;
        }

        const bounds = canvas.getBoundingClientRect();
        return (
            bounds.width > 0 &&
            bounds.height > 0 &&
            canvas.width > 0 &&
            canvas.height > 0
        );
    });
}

async function centerReceivesPointer(locator: Locator): Promise<boolean> {
    return locator.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const center = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
        );

        return center !== null && (center === element || element.contains(center));
    });
}

test("renders the graph and exercises its core controls", async ({page}) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    // Vercel injects these scripts only on its platform. A local production
    // server has no endpoints for them, so isolate the graph smoke from that
    // external service while retaining strict error collection for the app.
    for (const scriptPath of [
        "**/_vercel/speed-insights/script.js",
        "**/_vercel/insights/script.js",
    ]) {
        await page.route(scriptPath, (route) =>
            route.fulfill({
                status: 200,
                contentType: "application/javascript",
                body: "",
            }),
        );
    }

    page.on("console", (message) => {
        if (message.type() === "error") {
            consoleErrors.push(message.text());
        }
    });
    page.on("pageerror", (error) => {
        pageErrors.push(error.stack ?? error.message);
    });

    const response = await page.goto("/");
    expect(response, "root navigation should return a response").not.toBeNull();
    expect(response?.ok(), "root navigation should succeed").toBe(true);

    const axesButton = page.getByRole("button", {
        name: "Show Axes",
        exact: true,
    });
    const resetButton = page.getByRole("button", {
        name: "Reset Camera",
        exact: true,
    });
    const rotationButton = page.getByRole("button", {
        name: "Pause Auto Rotation",
        exact: true,
    });
    const canvas = page.locator("canvas");

    await expect(axesButton).toBeVisible();
    await expect(resetButton).toBeVisible();
    await expect(rotationButton).toBeVisible();
    await expect(canvas).toBeVisible();
    await expect(axesButton).toBeEnabled();
    await expect(resetButton).toBeEnabled();
    await expect(rotationButton).toBeEnabled();

    await expect
        .poll(() => hasSizedCanvas(page), {
            message:
                "expected a visible canvas with nonzero CSS and backing-store dimensions",
            timeout: 15_000,
        })
        .toBe(true);

    // Pause continuous graph rotation before exercising the remaining controls.
    // Software-rendered WebGL can starve Playwright's initial actionability wait,
    // so first prove that the button's center receives pointer events and then
    // dispatch the real click. All later interactions use normal actionability.
    await expect
        .poll(() => centerReceivesPointer(rotationButton), {
            message: "rotation control center should receive pointer events",
        })
        .toBe(true);
    await rotationButton.click({force: true});
    const resumeRotationButton = page.getByRole("button", {
        name: "Resume Auto Rotation",
        exact: true,
    });
    await expect(resumeRotationButton).toBeVisible();

    await axesButton.click();
    const hideAxesButton = page.getByRole("button", {
        name: "Hide Axes",
        exact: true,
    });
    await expect(hideAxesButton).toBeVisible();
    await hideAxesButton.click();
    await expect(axesButton).toBeVisible();

    await resetButton.click();
    await page.waitForTimeout(1_200);
    expect(await hasSizedCanvas(page), "canvas should remain ready after reset").toBe(
        true,
    );

    await resumeRotationButton.click();
    await expect(rotationButton).toBeVisible();
    await rotationButton.click();
    await expect(resumeRotationButton).toBeVisible();

    // Reading an active software-rendered context can be expensive. Do it once,
    // after pausing rotation and completing every interaction.
    expect(
        isWebGLReady(await readWebGLReadiness(page)),
        "expected an initialized WebGL context with nonzero drawing-buffer dimensions",
    ).toBe(true);

    expect(
        pageErrors,
        `unexpected page errors:\n${pageErrors.join("\n")}`,
    ).toEqual([]);
    expect(
        consoleErrors,
        `unexpected console errors:\n${consoleErrors.join("\n")}`,
    ).toEqual([]);
});
