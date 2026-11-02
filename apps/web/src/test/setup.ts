import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// Several jsdom files render the whole app in parallel; the 1 s default is tight on a busy machine.
configure({ asyncUtilTimeout: 4000 });

// jsdom does not implement scrolling; the router calls it on navigation.
window.scrollTo = () => {};

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});
