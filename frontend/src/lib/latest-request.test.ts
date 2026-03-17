import { describe, expect, it } from "vitest";

import { createLatestRequestController } from "@/lib/latest-request";

describe("createLatestRequestController", () => {
  it("aborts the previous request when a new one starts", () => {
    const controller = createLatestRequestController();

    const first = controller.start();
    const second = controller.start();

    expect(first.controller.signal.aborted).toBe(true);
    expect(second.controller.signal.aborted).toBe(false);
    expect(controller.shouldIgnore(first)).toBe(true);
    expect(controller.shouldIgnore(second)).toBe(false);
  });

  it("invalidates the active request without starting a new one", () => {
    const controller = createLatestRequestController();

    const active = controller.start();
    controller.invalidate();

    expect(active.controller.signal.aborted).toBe(true);
    expect(controller.isLatest(active)).toBe(false);
    expect(controller.shouldIgnore(active)).toBe(true);
  });

  it("releases only the current request handle", () => {
    const controller = createLatestRequestController();

    const first = controller.start();
    const second = controller.start();

    controller.release(first);
    expect(controller.shouldIgnore(second)).toBe(false);

    controller.release(second);
    expect(controller.isLatest(second)).toBe(true);
    expect(controller.shouldIgnore(second)).toBe(false);
  });
});
