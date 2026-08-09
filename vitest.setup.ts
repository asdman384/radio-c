import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// globals: false means Testing Library's auto-cleanup never registers itself;
// do it explicitly instead. A no-op for test files that never render anything.
afterEach(() => {
  cleanup();
});
