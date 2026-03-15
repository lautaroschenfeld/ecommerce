"use client";

export type LatestRequestHandle = {
  requestId: number;
  controller: AbortController;
};

export function createLatestRequestController() {
  let currentController: AbortController | null = null;
  let currentRequestId = 0;

  return {
    start(): LatestRequestHandle {
      currentController?.abort();
      const controller = new AbortController();
      currentRequestId += 1;
      currentController = controller;
      return {
        requestId: currentRequestId,
        controller,
      };
    },
    abort() {
      currentController?.abort();
      currentController = null;
    },
    invalidate() {
      currentController?.abort();
      currentController = null;
      currentRequestId += 1;
    },
    isLatest(handle: LatestRequestHandle) {
      return handle.requestId === currentRequestId;
    },
    shouldIgnore(handle: LatestRequestHandle) {
      return handle.controller.signal.aborted || handle.requestId !== currentRequestId;
    },
    release(handle: LatestRequestHandle) {
      if (handle.requestId === currentRequestId && currentController === handle.controller) {
        currentController = null;
      }
    },
  };
}
